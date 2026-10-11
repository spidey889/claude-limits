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
    const suffix = resetText ? '   ' + paint(resetText, resetPassed ? 93 : 90) : '';
    if (value.percent === null) return heading + 'usage not exposed' + suffix;
    // Clamp only visual fill: an over-limit reading still shows its exact percent.
    // Bright hollow cells keep the unused portion visible beside the used cells.
    const code = resetPassed ? 93 : value.percent < 50 ? 95 : value.percent < 80 ? 93 : 91;
    const filled = Math.round(Math.min(value.percent, 100) / 10);
    const bar = Array.from({ length: 10 }, (_, index) => paint(index < filled ? '■' : '□', index < filled ? code : 37)).join(' ');
    const percent = (Number(value.percent.toFixed(1)) + '% used').padStart(10);
    return heading + paint(percent, '1;' + code) + '   ' + bar + suffix;
  }
  return [line('5h', usage.fiveHour), line('Weekly', usage.weekly)].join('\n');
}

module.exports = { parseUsage, parseMessageLimit, formatUsage, timestamp };
