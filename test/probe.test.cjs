'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readQuotaStream, probeQuota } = require('../probe.cjs');

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
