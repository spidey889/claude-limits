'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const script = path.join(__dirname, '..', 'scripts', 'reconnect-desktop.ps1');
const appPath = 'C:\\fixture\\Claude.exe';
const subject = 'CN="Anthropic, PBC", O="Anthropic, PBC", L=San Francisco, C=US';

function recovery({ processes = [
  { Id: 101, SessionId: 1, Path: appPath }, { Id: 102, SessionId: 1, Path: appPath },
  { Id: 201, SessionId: 2, Path: 'C:\\another-session\\Claude.exe' },
], signer = subject, status = 'Valid', stopFails = false, openFails = false, input = 'restore\n' } = {}) {
  const fixtures = JSON.stringify({ processes, signer, status, stopFails, openFails }).replaceAll("'", "''");
  const command = `
    $fixture = ConvertFrom-Json '${fixtures}'
    function Get-Process {
      param([int]$Id, [string]$Name, [string]$ErrorAction)
      if ($Id) { [pscustomobject]@{SessionId=1} } else { $fixture.processes }
    }
    function Get-AuthenticodeSignature {
      param($LiteralPath)
      [pscustomobject]@{Status=$fixture.status; SignerCertificate=[pscustomobject]@{Subject=$fixture.signer}}
    }
    function Stop-Process {
      param([Parameter(ValueFromPipeline=$true)]$InputObject)
      process {
        [Console]::Out.WriteLine('STOP:' + $InputObject.Id)
        if ($fixture.stopFails) { throw 'simulated stop failure' }
      }
    }
    function Wait-Process {
      param([Parameter(ValueFromPipeline=$true)]$InputObject, $Timeout)
      process {}
    }
    function Start-Process {
      param($FilePath)
      [Console]::Out.WriteLine('OPEN:' + $FilePath)
      if ($fixture.openFails) { throw 'simulated reopen failure' }
    }
    & '${script.replaceAll("'", "''")}'
  `;
  const result = spawnSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { input, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.ifError(result.error);
  assert.equal(result.stderr.trim(), '');
  return { status: result.status, lines: result.stdout.trim().split(/\r?\n/) };
}

test('recovery quits only the signed Desktop executable in the current Windows session', () => {
  assert.deepEqual(recovery(), { status: 0,
    lines: ['STOP:101', 'STOP:102', '{"ready":true}', 'OPEN:' + appPath, '{"restored":true}'] });
});

test('stdin closing after a parent failure still reopens Desktop', () => {
  const result = recovery({ input: '' });
  assert.equal(result.status, 0);
  assert.ok(result.lines.includes('OPEN:' + appPath));
  assert.equal(result.lines.at(-1), '{"restored":true}');
});

test('an unexpected signer or invalid signature is never stopped', () => {
  for (const options of [{ signer: 'CN=Other, O=Other' }, { status: 'NotSigned' },
    { signer: 'CN=Other, O="Anthropic, PBC impostor"' }]) {
    assert.deepEqual(recovery(options), { status: 1, lines: ['{"ready":false}', '{"restored":true}'] });
  }
});

test('ambiguous executable paths are not stopped', () => {
  assert.deepEqual(recovery({ processes: [
    { Id: 101, SessionId: 1, Path: appPath }, { Id: 103, SessionId: 1, Path: 'C:\\other\\Claude.exe' },
  ] }), { status: 1, lines: ['{"ready":false}', '{"restored":true}'] });
});

test('no running eligible Desktop app is a safe failure', () => {
  assert.deepEqual(recovery({ processes: [{ Id: 201, SessionId: 2, Path: appPath }] }),
    { status: 1, lines: ['{"ready":false}', '{"restored":true}'] });
});

test('a partial quit failure still attempts to reopen the selected app', () => {
  assert.deepEqual(recovery({ stopFails: true }), { status: 1,
    lines: ['STOP:101', '{"ready":false}', 'OPEN:' + appPath, '{"restored":true}'] });
});

test('reopening failure is explicitly returned to the CLI', () => {
  const result = recovery({ openFails: true });
  assert.equal(result.status, 1);
  assert.deepEqual(result.lines.slice(-2), ['OPEN:' + appPath, '{"restored":false}']);
});
