'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReader } = require('../measurement.cjs');

test('available read-only quota never invokes a message probe', async () => {
  let probes = 0;
  const reader = createReader({ usage: async () => ({ fiveHour: { percent: 8, resetsAt: null }, weekly: null }) },
    async () => { probes++; }, async () => {});
  assert.equal((await reader()).source, 'endpoint');
  assert.equal(probes, 0);
});

test('concurrent commands and a just-finished reading share one probe', async () => {
  let probes = 0, now = 2000000000000;
  const reader = createReader({ usage: async () => ({ fiveHour: null, weekly: null }) },
    async () => { probes++; return { usage: { fiveHour: { percent: 4, resetsAt: null }, weekly: null },
      source: 'reply', observedAt: new Date(now).toISOString() }; }, async () => {}, () => now);
  await Promise.all([reader(), reader()]);
  await reader();
  assert.equal(probes, 1);
  now += 300000;
  await reader();
  assert.equal(probes, 2);
});

test('request failures do not trigger a quota-spending fallback', async () => {
  let probes = 0;
  const reader = createReader({ usage: async () => { throw new Error('offline'); } },
    async () => { probes++; }, async () => {});
  await assert.rejects(reader(), /offline/);
  assert.equal(probes, 0);
});

test('a snapshot write failure cannot discard a real live reading', async () => {
  const reader = createReader({ usage: async () => ({ fiveHour: { percent: 8, resetsAt: null }, weekly: null }) },
    async () => {}, async () => { throw new Error('read only disk'); });
  assert.equal((await reader()).usage.fiveHour.percent, 8);
});
