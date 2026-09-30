'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUsage, parseMessageLimit, formatUsage } = require('../usage.cjs');

test('a real empty free-plan response never becomes zero usage', () => {
  const usage = parseUsage({ five_hour: null, seven_day: null, limits: [] });
  assert.deepEqual(usage, { fiveHour: null, weekly: null });
  assert.equal(formatUsage(usage), '5h: not exposed by Claude\nWeekly: not exposed by Claude');
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
