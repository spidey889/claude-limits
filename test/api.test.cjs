'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeClient } = require('../api.cjs');
const { createReader } = require('../measurement.cjs');
const { probeQuota } = require('../probe.cjs');
const blockedBody = { type: 'error', error: { type: 'rate_limit_error', message: 'sensitive text',
  details: { error_code: 'message_limit_exceeded', message_limit: { type: 'exceeded_limit', windows: {
    '5h': { status: 'exceeded_limit', utilization: 0.99, resets_at: 1893492000 },
    '7d': { status: 'within_limit', utilization: 0.04 },
  } } } } };
const jsonResponse = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', ...headers },
});

test('a 429 carries only the confirmed fresh quota, without raw error contents', async () => {
  const client = makeClient({ cookies: {}, organization: 'fixture' }, async () => jsonResponse(blockedBody, 429));
  await assert.rejects(client.usage(), error => {
    assert.equal(error.status, 429);
    assert.equal(error.measurement.source, 'limit-error');
    assert.equal(error.measurement.usage.fiveHour.percent, 99);
    assert.equal(error.measurement.usage.fiveHour.limited, true);
    assert.equal(error.measurement.usage.weekly.percent, 4);
    assert.ok(Number.isFinite(Date.parse(error.measurement.observedAt)));
    assert.doesNotMatch(JSON.stringify(error) + error.message, /sensitive text|message_limit_exceeded/);
    return true;
  });
});

test('generic and malformed 429 responses remain safe errors, with retry guidance', async () => {
  for (const body of [new Response('sensitive html', { status: 429 }),
    new Response('not-json', { status: 429, headers: { 'content-type': 'application/json' } }),
    jsonResponse({ error: { type: 'rate_limit_error', message: 'sensitive text' } }, 429, { 'retry-after': '45' })]) {
    const client = makeClient({ cookies: {}, organization: 'fixture' }, async () => body);
    await assert.rejects(client.usage(), error => {
      assert.equal(error.measurement, null);
      assert.match(error.message, /Exact usage unavailable/);
      assert.doesNotMatch(error.message, /100%|sensitive|not-json/);
      if (body.headers.get('retry-after')) assert.match(error.message, /45 seconds/);
      return true;
    });
  }
});

test('oversized 429 JSON is discarded rather than parsed or exposed', async () => {
  const client = makeClient({ cookies: {}, organization: 'fixture' }, async () => jsonResponse({
    ...blockedBody, oversized: 'sensitive text'.repeat(6000),
  }, 429));
  await assert.rejects(client.usage(), error => error.measurement === null && !error.message.includes('sensitive'));
});

test('browser verification takes priority over quota-shaped error bodies', async () => {
  const client = makeClient({ cookies: {}, organization: 'fixture' }, async () => jsonResponse(blockedBody, 429, { 'cf-mitigated': 'challenge' }));
  await assert.rejects(client.usage(), error => error.message === 'Claude requires a browser verification.' && !error.measurement);
});

test('one rejected temporary completion yields fresh quota and still cleans up', async () => {
  const requests = []; let saved;
  const client = makeClient({ cookies: {}, organization: 'fixture' }, async (url, options) => {
    requests.push({ url, method: options.method });
    if (url.endsWith('/usage')) return jsonResponse({ five_hour: null, seven_day: null });
    if (url.endsWith('/completion')) return jsonResponse(blockedBody, 429);
    if (options.method === 'DELETE') return new Response();
    const created = JSON.parse(options.body);
    return jsonResponse({ uuid: created.uuid, is_temporary: true });
  });
  const reader = createReader(client, () => probeQuota(client), result => { saved = result; });
  const result = await reader();
  assert.equal(result.source, 'limit-error');
  assert.equal(result.usage.fiveHour.percent, 99);
  assert.equal(result.usage.fiveHour.limited, true);
  assert.deepEqual(saved, result);
  assert.equal(requests.filter(item => item.url.endsWith('/completion')).length, 1);
  assert.equal(requests.filter(item => item.method === 'DELETE').length, 1);
});

test('credentials go only to the Claude host and redirects are blocked', async () => {
  let request;
  const client = makeClient({ cookies: { sessionKey: 'fixture' }, organization: 'fixture' }, async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ five_hour: null, seven_day: null, limits: [] }));
  });
  await client.usage();
  assert.equal(new URL(request.url).origin, 'https://claude.ai');
  assert.equal(request.options.redirect, 'error');
  await assert.rejects(client.request('https://example.com/api/usage'), /Invalid Claude route/);
});

test('auth failures produce a safe error, not response contents', async () => {
  const client = makeClient({ cookies: {}, organization: 'fixture' }, async () => new Response('sensitive details', { status: 401 }));
  await assert.rejects(client.usage(), error => error.message === 'Claude session expired. Sign in again.');
});
