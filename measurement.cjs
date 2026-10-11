'use strict';

function createReader(client, probe, save, now = Date.now) {
  let pending = null, last = null, emptyEndpointUntil = 0;
  return async function read() {
    if (pending) return pending;
    // Concurrent commands share one probe. A just-finished reply is not sent twice.
    const time = now(), age = last ? time - Date.parse(last.observedAt) : NaN;
    const resetPassed = last && Object.values(last.usage)
      .some(window => window?.resetsAt && Date.parse(window.resetsAt) <= time);
    if (age >= 0 && age < 10000 && !resetPassed) return last;
    pending = (async () => {
      // Remember endpoint availability, never saved quota. Recheck after five
      // minutes so a newly exposed read-only window can avoid message probes.
      const usage = now() < emptyEndpointUntil ? null : await client.usage();
      if (usage) emptyEndpointUntil = usage.fiveHour || usage.weekly ? 0 : now() + 300000;
      const result = usage && (usage.fiveHour || usage.weekly)
        ? { usage, observedAt: new Date(now()).toISOString(), source: 'endpoint' }
        : await probe(client);
      last = result;
      // A diagnostic snapshot write failure must not lose a real live reading.
      await Promise.resolve().then(() => save(result)).catch(() => {});
      return result;
    })();
    try { return await pending; }
    finally { pending = null; }
  };
}

module.exports = { createReader };
