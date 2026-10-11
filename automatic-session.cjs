'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const { readDesktopSession } = require('./session.cjs');

async function withDesktopClosed(read, { launch = spawn, timeoutMs = 20000 } = {}) {
  const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // PowerShell 7's inherited module path can break Windows PowerShell's
  // signature cmdlet. This child needs only its own built-in modules.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'psmodulepath'));
  env.PSModulePath = path.join(path.dirname(shell), 'Modules');
  const child = launch(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'scripts', 'reconnect-desktop.ps1')], {
    env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
  });
  let buffer = '', first = null, restored = false, settleReady;
  const ready = new Promise(resolve => { settleReady = resolve; });
  const release = () => {
    if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end('restore\n');
  };
  // Close stdin on a timeout instead of killing PowerShell: its finally must
  // still reopen Desktop, even when connection or the parent process fails.
  const timer = setTimeout(() => { settleReady(null); release(); }, timeoutMs);
  // Resolve rather than reject early: both readiness and cleanup are always
  // awaited, including launch failures, without unhandled promise rejections.
  const finished = new Promise(resolve => {
    child.on('error', () => { settleReady(null); resolve(false); });
    child.on('close', code => { settleReady(null); resolve(code === 0 && restored); });
  });
  child.stdin.on('error', () => {});
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 4096) { release(); settleReady(null); return; }
    let boundary;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
      try {
        const message = JSON.parse(line);
        if (!first) { first = message; settleReady(message); }
        if (message.restored === true) restored = true;
      } catch { release(); settleReady(null); }
    }
  });
  let session, failure;
  try {
    const status = await ready;
    clearTimeout(timer);
    if (!status?.ready) throw new Error('Could not reconnect Claude Desktop automatically. Try again; your Desktop session may need signing in.');
    session = await read();
  } catch (error) { failure = error; }
  finally { clearTimeout(timer); release(); }
  const reopened = await finished;
  if (failure) throw failure;
  if (!reopened) throw new Error('Claude connected, but Desktop could not reopen. Open Claude Desktop and run claudeli again.');
  return session;
}

async function readAutomaticSession({ read = readDesktopSession, recover = withDesktopClosed,
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  try { return await read(); }
  catch (error) { if (error.code !== 'CLAUDE_SESSION_LOCKED') throw error; }
  return recover(async () => {
    // Once all Desktop processes exit, Windows may briefly retain the file
    // handle. Retry only this local read, never an authenticated completion.
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await read(); }
      catch (error) { if (error.code !== 'CLAUDE_SESSION_LOCKED') throw error; }
      if (attempt < 4) await delay(200);
    }
    throw new Error('Could not unlock the Claude Desktop session automatically. Try again.');
  });
}

module.exports = { readAutomaticSession, withDesktopClosed };
