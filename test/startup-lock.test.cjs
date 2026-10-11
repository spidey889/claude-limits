'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { withStartupLock } = require('../startup-lock.cjs');
const pipeOptions = () => ({ pipe: '\\\\.\\pipe\\claude-limits-test-' + randomUUID() });

test('parallel cold starts are serialized so only one can restart Desktop at a time', async () => {
  const options = pipeOptions(), order = [];
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = withStartupLock(async () => { order.push('first'); enter(); await gate; order.push('released'); }, options);
  await entered;
  const second = withStartupLock(() => { order.push('second'); return 'connected'; }, options);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(order, ['first']);
  release();
  assert.deepEqual(await Promise.all([first, second]), [undefined, 'connected']);
  assert.deepEqual(order, ['first', 'released', 'second']);
});

test('the startup guard is released after a failed connection', async () => {
  const options = pipeOptions();
  await assert.rejects(withStartupLock(() => { throw new Error('login failed'); }, options), /login failed/);
  assert.equal(await withStartupLock(() => 'reconnected', options), 'reconnected');
});

test('waiting for another cold start is bounded without stopping that connection', async () => {
  const options = pipeOptions();
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = withStartupLock(async () => { enter(); await gate; }, options);
  await entered;
  try {
    await assert.rejects(withStartupLock(() => { throw new Error('Must not start'); },
      { ...options, timeoutMs: 10 }), /still reconnecting/);
  } finally { release(); await first; }
});
