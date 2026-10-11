'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReader } = require('../measurement.cjs');

test('fresh quota in a rejected endpoint response does not trigger a message probe', async () => {
  let probes = 0, saved;
  const measured = { usage: { fiveHour: { percent: 99, resetsAt: null, limited: true }, weekly: null },
    source: 'limit-error', observedAt: '2030-01-01T10:00:00Z' };
  const reader = createReader({ usage: async () => { throw Object.assign(new Error('blocked'), { status: 429, measurement: measured }); } },
    async () => { probes++; }, result => { saved = result; });
  assert.deepEqual(await reader(), measured);
  assert.deepEqual(saved, measured);
  assert.equal(probes, 0);
});

test('independent blocked commands still request new measurements', async () => {
  let probes = 0;
  const reader = createReader({ usage: async () => ({ fiveHour: null, weekly: null }) }, async () => {
    probes++;
    throw Object.assign(new Error('blocked'), { status: 429, measurement: {
      usage: { fiveHour: { percent: 98 + probes, resetsAt: null, limited: true }, weekly: null },
      source: 'limit-error', observedAt: new Date(2000000000000 + probes * 1000).toISOString(),
    } });
  }, () => {});
  const first = await reader(), second = await reader();
  assert.equal(first.usage.fiveHour.percent, 99);
  assert.equal(second.usage.fiveHour.percent, 100);
  assert.notEqual(first.observedAt, second.observedAt);
  assert.equal(probes, 2);
});

test('a later generic 429 cannot reuse an earlier confirmed limit measurement', async () => {
  let reads = 0, saved = 0;
  const reader = createReader({ usage: async () => {
    const error = Object.assign(new Error('rate-limited'), { status: 429 });
    if (++reads === 1) error.measurement = { usage: { fiveHour: { percent: 99, resetsAt: null }, weekly: null }, source: 'limit-error' };
    throw error;
  } }, () => { throw new Error('Must not probe'); }, () => { saved++; });
  assert.equal((await reader()).usage.fiveHour.percent, 99);
  await assert.rejects(reader(), /rate-limited/);
  assert.equal(saved, 1);
});

test('available read-only quota never invokes a message probe', async () => {
  let probes = 0;
  const reader = createReader({ usage: async () => ({ fiveHour: { percent: 8, resetsAt: null }, weekly: null }) },
    async () => { probes++; }, async () => {});
  assert.equal((await reader()).source, 'endpoint');
  assert.equal(probes, 0);
});

test('only concurrent commands share a probe; independent commands always read fresh', async () => {
  let probes = 0, now = 2000000000000;
  const reader = createReader({ usage: async () => ({ fiveHour: null, weekly: null }) },
    async () => { probes++; return { usage: { fiveHour: { percent: 4, resetsAt: null }, weekly: null },
      source: 'reply', observedAt: new Date(now).toISOString() }; }, async () => {}, () => now);
  await Promise.all([reader(), reader()]);
  assert.equal(probes, 1);
  await reader();
  assert.equal(probes, 2);
  now += 300000;
  await reader();
  assert.equal(probes, 3);
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

test('an empty endpoint is skipped briefly, then checked again for read-only quota', async () => {
  let endpoints = 0, probes = 0, now = 2000000000000;
  const reader = createReader({ usage: async () => {
    endpoints++;
    return endpoints === 1 ? { fiveHour: null, weekly: null }
      : { fiveHour: { percent: 12, resetsAt: null }, weekly: null };
  } }, async () => {
    probes++;
    return { usage: { fiveHour: { percent: 8, resetsAt: null }, weekly: null },
      source: 'reply', observedAt: new Date(now).toISOString() };
  }, async () => {}, () => now);
  await reader();
  now += 11000;
  assert.equal((await reader()).source, 'reply');
  assert.equal(endpoints, 1);
  assert.equal(probes, 2);
  now += 300000;
  assert.equal((await reader()).source, 'endpoint');
  now += 11000;
  await reader();
  assert.equal(endpoints, 3);
  assert.equal(probes, 2);
});

test('a command after a reset requests a new reading without predicting replenishment', async () => {
  let endpoints = 0, now = 2000000000000;
  const reader = createReader({ usage: async () => {
    endpoints++;
    return { fiveHour: { percent: 8, resetsAt: new Date(now + 1000).toISOString() }, weekly: null };
  } }, async () => {}, async () => {}, () => now);
  assert.equal((await reader()).usage.fiveHour.percent, 8);
  now += 1000;
  assert.equal((await reader()).usage.fiveHour.percent, 8);
  assert.equal(endpoints, 2);
});

test('independent commands request new observations even when the clock moves backwards', async () => {
  let endpoints = 0, now = 2000000000000;
  const reader = createReader({ usage: async () => {
    endpoints++;
    return { fiveHour: { percent: 8, resetsAt: null }, weekly: null };
  } }, async () => {}, async () => {}, () => now);
  await reader();
  now -= 1000;
  await reader();
  assert.equal(endpoints, 2);
});

test('a failed scheduled endpoint check does not reuse old readings or spend a probe', async () => {
  let endpoints = 0, probes = 0, now = 2000000000000;
  const reader = createReader({ usage: async () => {
    if (++endpoints > 1) throw new Error('offline');
    return { fiveHour: null, weekly: null };
  } }, async () => {
    probes++;
    return { usage: { fiveHour: { percent: 8, resetsAt: null }, weekly: null },
      source: 'reply', observedAt: new Date(now).toISOString() };
  }, async () => {}, () => now);
  await reader();
  now += 300000;
  await assert.rejects(reader(), /offline/);
  assert.equal(probes, 1);
  await assert.rejects(reader(), /offline/);
  assert.equal(endpoints, 3);
});
