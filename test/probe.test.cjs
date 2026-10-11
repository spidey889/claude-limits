'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readQuotaStream, probeQuota, createProber } = require('../probe.cjs');

async function* chunks(text) {
  const bytes = Buffer.from(text);
  for (let i = 0; i < bytes.length; i += 3) yield bytes.subarray(i, i + 3);
}

test('chunked CRLF SSE extracts only quota, including free-plan weekly data', async () => {
  const measurement = await readQuotaStream(chunks(
    'event: content_block_delta\r\ndata: {"text":"private reply"}\r\n\r\n' +
    'event: message_limit\r\ndata: {"message_limit":{"windows":{"5h":{"utilization":0.04},"7d":{"utilization":0.16}}}}\r\n\r\n'));
  assert.equal(measurement.usage.fiveHour.percent, 4);
  assert.equal(measurement.usage.weekly.percent, 16);
  assert.equal(measurement.source, 'reply');
  assert.ok(!JSON.stringify(measurement).includes('private reply'));
});

test('reply without quota fails instead of producing a fabricated reading', async () => {
  await assert.rejects(readQuotaStream(chunks('event: message_stop\ndata: {}\n\n')), /did not include quota/);
});

test('probe cleans up its own conversation and never retries a failed message', async () => {
  const calls = [];
  const client = { organization: 'test', request: async (route, options) => {
    calls.push({ route, options });
    if (options.method === 'DELETE') return {};
    if (route.endsWith('/completion')) throw new Error('connection lost');
    const { uuid } = JSON.parse(options.body);
    return { json: async () => ({ uuid, is_temporary: true }) };
  } };
  await assert.rejects(probeQuota(client), /connection lost/);
  assert.equal(calls.filter(call => call.route.endsWith('/completion')).length, 1);
  assert.equal(calls.at(-1).options.method, 'DELETE');
  assert.equal(calls.at(-1).route, calls[1].route.replace('/completion', ''));
});

test('probe refuses to send a message if Claude does not confirm temporary mode', async () => {
  const calls = [];
  const client = { organization: 'test', request: async (route, options) => {
    calls.push(options.method);
    return { json: async () => ({ uuid: JSON.parse(options.body || '{}').uuid, is_temporary: false }) };
  } };
  await assert.rejects(probeQuota(client), /temporary probe/);
  assert.deepEqual(calls, ['POST', 'DELETE']);
});

const completeQuota = 'event: message_limit\ndata: {"message_limit":{"windows":{"5h":{"utilization":0.04},"7d":{"utilization":0.16}}}}\n\n';

test('both quota windows return immediately without reading the stream tail', async () => {
  let closed = false;
  async function* delayedTail() {
    try {
      yield Buffer.from(completeQuota);
      throw new Error('The stream tail must not be read.');
    } finally { closed = true; }
  }
  const result = await readQuotaStream(delayedTail());
  assert.equal(result.usage.weekly.percent, 16);
  assert.equal(closed, true);
});

test('early quota return cancels an open HTTP response body', { timeout: 2000 }, async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(Buffer.from(completeQuota)); },
    cancel() { cancelled = true; },
  });
  const result = await readQuotaStream(body);
  assert.equal(result.usage.fiveHour.percent, 4);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('partial quota continues until both windows arrive', async () => {
  const result = await readQuotaStream(chunks(
    'event: message_limit\ndata: {"windows":{"5h":{"utilization":0.03}}}\n\n' + completeQuota));
  assert.equal(result.usage.fiveHour.percent, 4);
  assert.equal(result.usage.weekly.percent, 16);
});

test('a slow or failed cleanup cannot delay a successful reading', async () => {
  const cleanup = Promise.withResolvers();
  let settled = false, deletes = 0;
  const client = { organization: 'test', request: async (route, options) => {
    if (options.method === 'DELETE') { deletes++; return cleanup.promise; }
    if (route.endsWith('/completion')) return { body: chunks(completeQuota) };
    return { json: async () => ({ uuid: JSON.parse(options.body).uuid, is_temporary: true }) };
  } };
  const reading = probeQuota(client).then(result => { settled = true; return result; });
  try {
    await new Promise(setImmediate);
    assert.equal(deletes, 1);
    assert.equal(settled, true, 'A measured quota must return while DELETE is still pending.');
    assert.equal((await reading).usage.fiveHour.percent, 4);
  } finally {
    cleanup.reject(new Error('cleanup failed'));
    await reading;
  }
});

test('a malformed creation response still cleans up only the requested conversation', async () => {
  const calls = [];
  const client = { organization: 'test', request: async (route, options) => {
    calls.push({ route, options });
    if (options.method === 'DELETE') return {};
    return { json: async () => { throw new Error('invalid creation response'); } };
  } };
  await assert.rejects(probeQuota(client), /invalid creation response/);
  await new Promise(setImmediate);
  const uuid = JSON.parse(calls[0].options.body).uuid;
  assert.equal(calls.length, 2);
  assert.equal(calls[1].route, calls[0].route + '/' + uuid);
  assert.equal(calls[1].options.method, 'DELETE');
});

function preparedFixture({ prepareGate = null, failPreparation = false, failSecondCompletion = false } = {}) {
  const calls = [], created = [];
  let completions = 0;
  const client = { organization: 'test', request: async (route, options) => {
    calls.push({ route, method: options.method });
    if (options.method === 'DELETE') return {};
    if (route.endsWith('/completion')) {
      completions++;
      if (failSecondCompletion && completions === 2) throw new Error('connection lost');
      return { body: chunks(completeQuota.replace('0.04', String(completions / 100))) };
    }
    const body = JSON.parse(options.body);
    assert.equal(body.is_temporary, true);
    assert.equal(body.prompt, undefined, 'Preparing an empty chat must never send a message.');
    created.push(body.uuid);
    if (created.length === 2) {
      if (failPreparation) throw new Error('setup unavailable');
      if (prepareGate) await prepareGate.promise;
    }
    return { json: async () => ({ uuid: body.uuid, is_temporary: true }) };
  } };
  return { client, calls, created, get completions() { return completions; } };
}

test('a prepared empty chat removes setup from the next command while quota stays fresh', async () => {
  const gate = Promise.withResolvers();
  const fixture = preparedFixture({ prepareGate: gate });
  const prober = createProber(fixture.client);
  try {
    assert.equal((await prober.read()).usage.fiveHour.percent, 1);
    assert.equal(fixture.created.length, 2);
    assert.equal(fixture.completions, 1, 'Background setup sent a message.');
    gate.resolve();
    await new Promise(setImmediate);
    const start = fixture.calls.length;
    assert.equal((await prober.read()).usage.fiveHour.percent, 2);
    assert.equal(fixture.calls[start].route, '/api/organizations/test/chat_conversations/' + fixture.created[1] + '/completion');
    assert.equal(new Set(fixture.created).size, 3, 'A temporary conversation was reused for multiple messages.');
  } finally { gate.resolve(); await prober.close(); }
  assert.equal(fixture.calls.filter(call => call.method === 'DELETE').length, 3);
});

test('failed background setup cannot lose a reading or retry a failed completion', async () => {
  const fixture = preparedFixture({ failPreparation: true, failSecondCompletion: true });
  const prober = createProber(fixture.client);
  try {
    assert.equal((await prober.read()).usage.fiveHour.percent, 1);
    await new Promise(setImmediate);
    await assert.rejects(prober.read(), /connection lost/);
    assert.equal(fixture.completions, 2);
    assert.equal(fixture.created.length, 3);
  } finally { await prober.close(); }
});

test('idle preparation expires without polling or sending another message', async () => {
  const fixture = preparedFixture();
  const prober = createProber(fixture.client, { idleMs: 1 });
  try {
    await prober.read();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fixture.created.length, 2);
    assert.equal(fixture.completions, 1);
    assert.equal(fixture.calls.filter(call => call.method === 'DELETE').length, 2);
  } finally { await prober.close(); }
});

test('stopping during background preparation cleans up the reserved empty chat', async () => {
  const gate = Promise.withResolvers();
  const fixture = preparedFixture({ prepareGate: gate });
  const prober = createProber(fixture.client);
  await prober.read();
  const closing = prober.close();
  gate.resolve();
  await closing;
  await assert.rejects(prober.read(), /helper stopped/);
  assert.equal(fixture.completions, 1);
  assert.equal(fixture.calls.filter(call => call.method === 'DELETE').length, 2);
});

test('stopping while a command claims pending setup never sends a new message', async () => {
  const gate = Promise.withResolvers();
  const fixture = preparedFixture({ prepareGate: gate });
  const prober = createProber(fixture.client);
  await prober.read();
  const next = prober.read();
  const rejected = assert.rejects(next, /helper stopped/);
  await prober.close();
  gate.resolve();
  await rejected;
  assert.equal(fixture.created.length, 2);
  assert.equal(fixture.completions, 1);
});
