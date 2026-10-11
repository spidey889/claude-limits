'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { readAutomaticSession, withDesktopClosed } = require('../automatic-session.cjs');
const locked = () => Object.assign(new Error('locked'), { code: 'CLAUDE_SESSION_LOCKED' });
const session = { cookie: 'synthetic-session', org: 'synthetic-org' };

test('an unlocked session connects without touching Desktop', async () => {
  assert.equal(await readAutomaticSession({ read: () => session,
    recover: () => { throw new Error('Must not restart'); } }), session);
});

test('a locked database is read while Desktop is closed and restored afterward', async () => {
  let closed = false;
  const order = [];
  const result = await readAutomaticSession({
    read: () => { order.push('read'); if (!closed) throw locked(); return session; },
    recover: async read => {
      closed = true; order.push('close');
      try { return await read(); } finally { closed = false; order.push('reopen'); }
    },
  });
  assert.equal(result, session);
  assert.deepEqual(order, ['read', 'close', 'read', 'reopen']);
  assert.equal(closed, false);
});

test('delayed Windows file release retries only the local read', async () => {
  let reads = 0, recoveries = 0, delays = 0;
  assert.equal(await readAutomaticSession({
    read: () => { if (++reads < 4) throw locked(); return session; },
    recover: read => { recoveries++; return read(); },
    delay: async ms => { assert.equal(ms, 200); delays++; },
  }), session);
  assert.equal(recoveries, 1);
  assert.equal(delays, 2);
});

test('a missing login does not restart Desktop', async () => {
  const error = new Error('Sign in to Claude Desktop first.');
  await assert.rejects(readAutomaticSession({ read: () => { throw error; },
    recover: () => { throw new Error('Must not restart'); } }), e => e === error);
});

test('a persistent file lock is bounded and still restores Desktop', async () => {
  let reads = 0, delays = 0, restored = false;
  await assert.rejects(readAutomaticSession({ read: () => { reads++; throw locked(); },
    recover: async read => { try { return await read(); } finally { restored = true; } },
    delay: async () => { delays++; },
  }), /Could not unlock.*automatically/);
  assert.equal(reads, 6);
  assert.equal(delays, 4);
  assert.equal(restored, true);
});

// Model the real stdin/stdout handshake without accessing any installed app.
function launcher({ ready = true, restored = true, status = 0, malformed = false, hang = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  let releases = 0, input = '';
  child.stdin = new Writable({ write(chunk, encoding, done) { input += chunk; done(); },
    final(done) {
      releases++;
      setImmediate(() => { child.stdout.write(JSON.stringify({ restored }) + '\n'); child.emit('close', status); });
      done();
    },
  });
  const launch = (file, args, options) => {
    assert.equal(options.windowsHide, true);
    assert.deepEqual(options.stdio, ['pipe', 'pipe', 'ignore']);
    assert.equal(options.env.PSModulePath, path.join(path.dirname(file), 'Modules'));
    assert.equal(Object.keys(options.env).filter(key => key.toLowerCase() === 'psmodulepath').length, 1);
    assert.ok(!JSON.stringify(args).includes(session.cookie));
    setImmediate(() => {
      if (!hang) child.stdout.write(malformed ? 'bad protocol\n' : JSON.stringify({ ready }) + '\n');
    });
    return child;
  };
  return { launch, child, releases: () => releases, input: () => input };
}

test('the recovery protocol sends no credentials and reopens before returning', async () => {
  const process = launcher();
  const result = await withDesktopClosed(() => session, process);
  assert.equal(result, session);
  assert.equal(process.releases(), 1);
  assert.equal(process.input(), 'restore\n');
});

test('a failed read still releases Desktop and preserves its login error', async () => {
  const process = launcher(), error = new Error('Session expired.');
  await assert.rejects(withDesktopClosed(() => { throw error; }, process), e => e === error);
  assert.equal(process.releases(), 1);
});

test('failure to select an eligible app does not attempt a session read', async () => {
  const process = launcher({ ready: false, status: 1 });
  await assert.rejects(withDesktopClosed(() => { throw new Error('Must not read'); }, process), /reconnect.*automatically/);
  assert.equal(process.releases(), 1);
});

test('failed reopening is reported instead of silently leaving Desktop closed', async () => {
  const process = launcher({ restored: false, status: 1 });
  await assert.rejects(withDesktopClosed(() => session, process), /Desktop could not reopen/);
});

test('malformed recovery output releases Desktop once', async () => {
  const process = launcher({ malformed: true });
  await assert.rejects(withDesktopClosed(() => session, process), /reconnect.*automatically/);
  assert.equal(process.releases(), 1);
});

test('a readiness timeout releases Desktop rather than killing its recovery process', async () => {
  const process = launcher({ hang: true });
  await assert.rejects(withDesktopClosed(() => session, { ...process, timeoutMs: 10 }), /reconnect.*automatically/);
  assert.equal(process.releases(), 1);
});

test('a recovery launch error is handled without hanging or an unhandled rejection', async () => {
  const process = launcher({ hang: true });
  setImmediate(() => process.child.emit('error', new Error('launch failed')));
  await assert.rejects(withDesktopClosed(() => session, process), /reconnect.*automatically/);
});
