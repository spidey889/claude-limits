'use strict';

function createReader(client, probe, save, now = Date.now) {
  let pending = null, last = null;
  return async function read() {
    if (pending) return pending;
    // Concurrent commands share one probe. A just-finished reply is not sent twice.
    if (last && now() - Date.parse(last.observedAt) < 10000) return last;
    pending = (async () => {
      const usage = await client.usage();
      const result = usage.fiveHour || usage.weekly
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
