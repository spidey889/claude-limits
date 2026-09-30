'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeClient } = require('../api.cjs');

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
