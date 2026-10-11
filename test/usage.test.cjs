'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUsage, parseMessageLimit, parseLimitError, formatUsage } = require('../usage.cjs');

const limitError = windows => ({ type: 'error', error: { type: 'rate_limit_error',
  details: { error_code: 'message_limit_exceeded', message_limit: { type: 'exceeded_limit', windows } } } });

test('confirmed blocked quota preserves 99 percent rather than inventing 100', () => {
  const usage = parseLimitError(limitError({
    '5h': { status: 'exceeded_limit', utilization: 0.99, resets_at: 1893492000 },
    '7d': { status: 'within_limit', utilization: 0.04 },
  }));
  assert.deepEqual(usage.fiveHour, { percent: 99, resetsAt: '2030-01-01T10:00:00.000Z', limited: true });
  assert.equal(usage.weekly.percent, 4);
  assert.equal(usage.weekly.limited, undefined);
  const plain = formatUsage(usage, 1800000000000);
  assert.match(plain, /5h.*99% used.*LIMIT REACHED.*resets/);
  assert.doesNotMatch(plain.split('\n')[1], /LIMIT REACHED/);
  assert.doesNotMatch(plain, /100%/);
  const colored = formatUsage(usage, 1800000000000, { color: true });
  assert.equal(require('node:util').stripVTControlCharacters(colored), plain);
  assert.match(colored, /\x1b\[1;95mLIMIT REACHED/);
});

test('weekly and simultaneous confirmed blocks label only the supplied windows', () => {
  const usage = parseLimitError(limitError({
    '5h': { status: 'within_limit', utilization: 0.2 },
    '7d': { status: 'exceeded_limit', utilization: 1.01 },
  }));
  const rows = formatUsage(usage).split('\n');
  assert.doesNotMatch(rows[0], /LIMIT REACHED/);
  assert.match(rows[1], /101% used.*LIMIT REACHED/);
  assert.equal((formatUsage(parseLimitError(limitError({
    '5h': { status: 'exceeded_limit', utilization: 1 },
    '7d': { status: 'exceeded_limit', utilization: 1 },
  }))).match(/LIMIT REACHED/g) ?? []).length, 2);
});

test('a confirmed block with no percentage remains explicitly unavailable', () => {
  const usage = parseLimitError(limitError({ '5h': { status: 'exceeded_limit' } }));
  assert.deepEqual(usage.fiveHour, { percent: null, resetsAt: null, limited: true });
  assert.match(formatUsage(usage), /usage not exposed.*LIMIT REACHED/);
  assert.doesNotMatch(formatUsage(usage), /\d+%|■/);
  assert.equal(parseLimitError(limitError({})), null);
});

test('generic throttles and unrelated error data never become quota readings', () => {
  assert.equal(parseLimitError({ error: { type: 'rate_limit_error', message: 'limit reached',
    details: { windows: { '5h': { utilization: 1 } } } } }), null);
  const raw = limitError({ '5h': { utilization: 1 } });
  raw.error.details.error_code = 'other_error';
  assert.equal(parseLimitError(raw), null);
});

test('a real empty free-plan response never becomes zero usage', () => {
  const usage = parseUsage({ five_hour: null, seven_day: null, limits: [] });
  assert.deepEqual(usage, { fiveHour: null, weekly: null });
  assert.equal(formatUsage(usage), '5h      not exposed by Claude\nWeekly  not exposed by Claude');
});

test('REST percentages, valid zero, and independently missing weekly data', () => {
  assert.deepEqual(parseUsage({ five_hour: { utilization: 0, resets_at: null } }), {
    fiveHour: { percent: 0, resetsAt: null }, weekly: null,
  });
  assert.equal(parseUsage({ five_hour: { utilization: 46.7 } }).fiveHour.percent, 46.7);
});

test('unified account limits exclude model and group pools', () => {
  const usage = parseUsage({ limits: [
    { kind: 'session', percent: 90, group_uuid: 'group' },
    { kind: 'weekly_all', percent: 80, scope: { model: { name: 'sonnet' } } },
    { kind: 'session', percent: 32, resets_at: '2030-01-01T10:00:00Z' },
    { kind: 'weekly_all', percent: 51 },
  ] });
  assert.equal(usage.fiveHour.percent, 32);
  assert.equal(usage.weekly.percent, 51);
});

test('SSE fractions and Unix reset timestamps normalize without inventing weekly data', () => {
  const usage = parseMessageLimit({ type: 'message_limit', message_limit: {
    windows: { '5h': { utilization: 0.375, resets_at: 1893492000 } },
  } });
  assert.equal(usage.fiveHour.percent, 37.5);
  assert.equal(usage.fiveHour.resetsAt, '2030-01-01T10:00:00.000Z');
  assert.equal(usage.weekly, null);
});

test('malformed values cannot masquerade as measurements', () => {
  for (const utilization of [null, undefined, '32', -1, NaN, Infinity]) {
    assert.equal(parseUsage({ five_hour: { utilization, resets_at: 'invalid' } }).fiveHour, null);
  }
  assert.deepEqual(parseUsage({ five_hour: { resets_at: '2030-01-01T10:00:00Z' } }).fiveHour,
    { percent: null, resetsAt: '2030-01-01T10:00:00.000Z' });
});

test('a passed reset never silently resets a snapshot to zero', () => {
  const usage = parseUsage({ five_hour: { utilization: 75, resets_at: '2020-01-01T10:00:00Z' } });
  assert.match(formatUsage(usage), /75% used.*reset time passed; refresh required/);
});

test('used allowance stays exact even when the visual bar reaches capacity', () => {
  const usage = parseUsage({ five_hour: { utilization: 26 }, seven_day: { utilization: 1 } });
  const rendered = formatUsage(usage);
  assert.match(rendered, /26% used/);
  assert.match(rendered, /1% used/);
  assert.equal(usage.fiveHour.percent, 26);
  assert.match(formatUsage(parseUsage({ five_hour: { utilization: 0 }, seven_day: { utilization: 127.5 } })), /0% used.*\nWeekly.*127.5% used/);
  assert.doesNotMatch(formatUsage(parseUsage({ five_hour: { resets_at: '2030-01-01T10:00:00Z' } })), /0% used/);
});

test('purple stays constant across usage levels and passed resets without changing text or alignment', () => {
  const { stripVTControlCharacters } = require('node:util');
  const usages = [
    parseUsage({ five_hour: { utilization: 26 }, seven_day: { utilization: 99 } }),
    ...[0, 50, 60, 80, 100, 127.5].map(utilization => parseUsage({ five_hour: { utilization } })),
    parseUsage({ five_hour: { utilization: 75, resets_at: '2020-01-01T10:00:00Z' } }),
  ];
  const now = Date.now();
  for (const usage of usages) {
    const plain = formatUsage(usage, now);
    const colored = formatUsage(usage, now, { color: true });
    assert.match(colored, /\x1b\[1;95m/);
    assert.doesNotMatch(colored, /\x1b\[1;(?:91|93)m/);
    assert.equal(stripVTControlCharacters(colored), plain);
    assert.doesNotMatch(plain, /\x1b|░/);
  }
});
