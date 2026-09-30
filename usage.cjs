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
  return {
    fiveHour: window(limit.windows?.['5h'], 100),
    weekly: window(limit.windows?.['7d'], 100),
  };
}

function formatUsage(usage, now = Date.now()) {
  function line(label, value) {
    if (!value) return label + ': not exposed by Claude';
    const parts = [value.percent === null ? 'usage not exposed' : `${Number(value.percent.toFixed(1))}% used`];
    if (value.resetsAt) {
      const reset = new Date(value.resetsAt);
      parts.push(reset.getTime() <= now ? 'reset time passed; refresh required'
        : 'resets ' + reset.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }));
    }
    return label + ': ' + parts.join(' | ');
  }
  return [line('5h', usage.fiveHour), line('Weekly', usage.weekly)].join('\n');
}

module.exports = { parseUsage, parseMessageLimit, formatUsage, timestamp };
