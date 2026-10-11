'use strict';

function createReader(client, probe, save, now = Date.now) {
  let pending = null, emptyEndpointUntil = 0;
  return async function read() {
    if (pending) return pending;
    // Only overlapping commands share an in-flight read. Every independent
    // invocation requests a new observation, even a second apart.
    pending = (async () => {
      // Remember endpoint availability, never saved quota. Recheck after five
      // minutes so a newly exposed read-only window can avoid message probes.
      let result;
      try {
        const usage = now() < emptyEndpointUntil ? null : await client.usage();
        if (usage) emptyEndpointUntil = usage.fiveHour || usage.weekly ? 0 : now() + 300000;
        result = usage && (usage.fiveHour || usage.weekly)
          ? { usage, observedAt: new Date(now()).toISOString(), source: 'endpoint' }
          : await probe(client);
      } catch (error) {
        // Claude can reject a message yet report fresh quota in the same 429.
        // Keep that measured data; never retry or substitute a saved reading.
        if (error.status !== 429 || !error.measurement) throw error;
        result = error.measurement;
      }
      // A diagnostic snapshot write failure must not lose a real live reading.
      await Promise.resolve().then(() => save(result)).catch(() => {});
      return result;
    })();
    try { return await pending; }
    finally { pending = null; }
  };
}

module.exports = { createReader };
