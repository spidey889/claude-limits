'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function unprotect(bytes) {
  const script = 'Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::ReadLine()); $p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($p))';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: bytes.toString('base64') + '\n', encoding: 'utf8', windowsHide: true, timeout: 10000,
  });
  if (result.status !== 0) throw new Error('Windows could not unlock the Claude Desktop session.');
  return Buffer.from(result.stdout.trim(), 'base64');
}

function readDesktopSession() {
  if (process.platform !== 'win32') throw new Error('Claude Limits currently supports Windows.');
  const { DatabaseSync } = require('node:sqlite');
  const root = path.join(process.env.APPDATA, 'Claude');
  const state = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8'));
  const wrapped = Buffer.from(state.os_crypt.encrypted_key, 'base64');
  if (wrapped.subarray(0, 5).toString() !== 'DPAPI') throw new Error('Unsupported Desktop session encryption.');
  const key = unprotect(wrapped.subarray(5));
  let db;
  try {
    try { db = new DatabaseSync(path.join(root, 'Network', 'Cookies'), { readOnly: true }); }
    catch { throw new Error('Quit Claude Desktop from its tray menu, then run claudeli again.'); }
    const rows = db.prepare("SELECT name, host_key, value, encrypted_value FROM cookies WHERE host_key IN ('claude.ai','.claude.ai')").all();
    const cookies = {};
    for (const row of rows) {
      if (!['sessionKey', 'lastActiveOrg', 'cf_clearance', '__cf_bm', 'anthropic-device-id'].includes(row.name)) continue;
      let value = row.value;
      if (!value && row.encrypted_value.length) {
        const encrypted = Buffer.from(row.encrypted_value);
        let plain;
        if (encrypted.subarray(0, 3).toString() === 'v10') {
          const cipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(3, 15));
          cipher.setAuthTag(encrypted.subarray(-16));
          plain = Buffer.concat([cipher.update(encrypted.subarray(15, -16)), cipher.final()]);
          // Chromium 130+ prepends the host digest to decrypted cookie values.
          const digest = crypto.createHash('sha256').update(row.host_key).digest();
          const start = plain.subarray(0, 32).equals(digest) ? 32 : 0;
          value = plain.subarray(start).toString('utf8');
        } else {
          plain = unprotect(encrypted);
          value = plain.toString('utf8');
        }
        plain.fill(0);
      }
      if (/[\r\n;]/.test(value)) throw new Error('Invalid Desktop session cookie.');
      cookies[row.name] = value;
    }
    if (!cookies.sessionKey) throw new Error('Sign in to Claude Desktop first.');
    if (!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(cookies.lastActiveOrg ?? '')) throw new Error('Open a chat in Claude Desktop first.');
    return { cookies, organization: cookies.lastActiveOrg };
  } finally {
    db?.close();
    key.fill(0);
  }
}

module.exports = { readDesktopSession };
