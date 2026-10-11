'use strict';

function timestamp(value) {
  if (value == null) return null;
  const ms = typeof value === 'number' && Number.isFinite(value)
    ? value * (value < 1e12 ? 1000 : 1)
    : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) && ms > 0 && ms <= 8640000000000000
    ? new Date(ms).toISOString() : null;
}

function window(value, multiplier = 1) {
  if (!value || typeof value !== 'object') return null;
  const raw = value.utilization ?? value.percent;
  const percent = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? raw * multiplier : null;
  const resetsAt = timestamp(value.resets_at ?? value.resetsAt);
  return percent !== null || resetsAt !== null ? { percent, resetsAt } : null;
}

function parseUsage(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Claude usage response.');
  const limits = Array.isArray(raw.limits) ? raw.limits : [];
  // Group/model-specific pools must not be mistaken for the overall account limit.
  const overall = kind => limits.find(item => item?.kind === kind && !item.group_uuid
    && !item.scope?.model && !item.scope?.surface);
  return {
    fiveHour: window(overall('session')) ?? window(raw.five_hour),
    weekly: window(overall('weekly_all')) ?? window(raw.seven_day),
  };
}

function parseMessageLimit(raw) {
  const limit = raw?.message_limit ?? raw;
  if (!limit || typeof limit !== 'object') throw new Error('Invalid Claude quota event.');
  // Chat stream utilization is a fraction; the REST endpoint uses percentages.
  function quotaWindow(name) {
    const value = limit.windows?.[name];
    const measured = window(value, 100);
    // A confirmed block is a separate state, not an inferred 100% reading.
    if (value?.status === 'exceeded_limit') {
      return { ...(measured ?? { percent: null, resetsAt: null }), limited: true };
    }
    return measured;
  }
  return { fiveHour: quotaWindow('5h'), weekly: quotaWindow('7d') };
}

function parseLimitError(raw) {
  const error = raw?.error;
  const details = error?.details;
  const limit = details?.message_limit;
  // This is the confirmed web completion error shape. A generic 429 is not
  // evidence of a spent allowance and must never manufacture a percentage.
  if (error?.type !== 'rate_limit_error' || details?.error_code !== 'message_limit_exceeded'
    || limit?.type !== 'exceeded_limit') return null;
  const usage = parseMessageLimit(limit);
  return usage.fiveHour || usage.weekly ? usage : null;
}

function formatUsage(usage, now = Date.now(), { color = false } = {}) {
  const paint = (text, code) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  function line(label, value) {
    const heading = label.padEnd(6) + '  ';
    if (!value) return heading + 'not exposed by Claude';
    let resetText = '', resetPassed = false;
    if (value.resetsAt) {
      const reset = new Date(value.resetsAt);
      resetPassed = reset.getTime() <= now;
      resetText = resetPassed ? 'reset time passed; refresh required'
        : 'resets ' + reset.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    }
    const limited = value.limited ? '   ' + paint('LIMIT REACHED', '1;95') : '';
    const suffix = limited + (resetText ? '   ' + paint(resetText, resetPassed ? 93 : 90) : '');
    if (value.percent === null) return heading + 'usage not exposed' + suffix;
    // Clamp only visual fill: an over-limit reading still shows its exact percent.
    // Bright hollow cells keep the unused portion visible beside the used cells.
    // Keep Claude's accepted purple identity at every usage level. Reset
    // warnings stay separate so stale readings do not recolor the quota bar.
    const code = 95;
    const filled = Math.round(Math.min(value.percent, 100) / 10);
    const bar = Array.from({ length: 10 }, (_, index) => paint(index < filled ? '■' : '□', index < filled ? code : 37)).join(' ');
    const percent = (Number(value.percent.toFixed(1)) + '% used').padStart(10);
    return heading + paint(percent, '1;' + code) + '   ' + bar + suffix;
  }
  return [line('5h', usage.fiveHour), line('Weekly', usage.weekly)].join('\n');
}

module.exports = { parseUsage, parseMessageLimit, parseLimitError, formatUsage, timestamp };
