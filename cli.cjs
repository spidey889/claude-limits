#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { readDesktopSession } = require('./session.cjs');
const { formatUsage } = require('./usage.cjs');
const runtime = require('./runtime.cjs');

function talk(action, token) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(runtime.pipe);
    let data = '';
    socket.setTimeout(115000, () => socket.destroy(new Error('Claude took too long to respond.')));
    socket.on('connect', () => socket.write(JSON.stringify({ action, token }) + '\n'));
    socket.on('error', reject);
    socket.on('data', chunk => {
      data += chunk;
      if (data.length > 65536) socket.destroy(new Error('Invalid local service response.'));
    });
    socket.on('end', () => {
      try {
        const reply = JSON.parse(data);
        reply.error ? reject(new Error(reply.error)) : resolve(reply);
      } catch { reject(new Error('Could not read the local Claude session service.')); }
    });
  });
}

async function connect(action = 'read') {
  let token;
  try { token = fs.readFileSync(runtime.keyPath, 'utf8').trim(); } catch {}
  if (token) {
    try { await talk('ping', token); return token; }
    catch (error) { if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error; }
  }
  if (action === 'stop') return null;
  const session = readDesktopSession();
  token ??= crypto.randomBytes(32).toString('hex');
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local service token file.');
  fs.writeFileSync(runtime.keyPath, token + '\n', { mode: 0o600 });
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, 'service.cjs')], {
    cwd: __dirname, detached: true, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
  });
  child.on('error', () => {});
  await new Promise((resolve, reject) => {
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify({ session, token }), resolve);
  });
  child.unref();
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await talk('ping', token); return token; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Could not start the local Claude session service.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--watch', '--connect', '--stop', '--help'].includes(arg))) {
    throw new Error('Use claudeli, claudeli --watch, claudeli --connect, or claudeli --stop.');
  }
  if (args.includes('--help')) {
    console.log('claudeli          Fetch real 5-hour and weekly usage\nclaudeli --watch  Refresh every 5 minutes; Ctrl+C stops watching\nclaudeli --connect  Connect once while Claude Desktop is quit\nclaudeli --stop   Forget the in-memory Desktop session\n\nOn free plans, fresh readings use one tiny temporary test message.');
    return;
  }
  const action = args.includes('--stop') ? 'stop' : args.includes('--connect') ? 'ping' : 'read';
  const token = await connect(action);
  if (action === 'stop') {
    if (token) await talk('stop', token);
    console.log('Claude session disconnected.'); return;
  }
  if (action === 'ping') { console.log('Connected. You can reopen Claude Desktop.'); return; }
  const watch = args.includes('--watch');
  if (watch) console.log('Refreshes every 5 minutes. Free-plan refreshes use a tiny test message. Ctrl+C stops.');
  while (true) {
    try {
      const { result } = await talk('read', token);
      if (watch && process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H');
      if (watch && process.stdout.isTTY) console.log('Every 5 minutes | tiny probe on free plans | Ctrl+C stops');
      console.log(formatUsage(result.usage));
      console.log('Checked ' + new Date(result.observedAt).toLocaleTimeString());
    } catch (error) {
      if (!watch) throw error;
      console.error('Refresh failed: ' + error.message);
    }
    if (!watch) break;
    await new Promise(resolve => setTimeout(resolve, 300000));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
