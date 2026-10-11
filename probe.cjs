'use strict';
const crypto = require('node:crypto');
const { parseMessageLimit } = require('./usage.cjs');

async function readQuotaStream(body) {
  const decoder = new TextDecoder();
  let buffer = '', measurement = null;
  function consume(event) {
    if (!/^event:\s*message_limit\s*$/m.test(event)) return;
    const data = event.split('\n').filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n');
    const usage = parseMessageLimit(JSON.parse(data));
    if (usage.fiveHour || usage.weekly) measurement = { usage, observedAt: new Date().toISOString(), source: 'reply' };
  }
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      consume(buffer.slice(0, boundary.index).replace(/\r\n/g, '\n'));
      buffer = buffer.slice(boundary.index + boundary[0].length);
      // Once both account windows arrive, discard the reply tail. Leaving the
      // async iterator also cancels the HTTP stream instead of keeping it open.
      if (measurement?.usage.fiveHour && measurement.usage.weekly) return measurement;
    }
    // Reply contents are discarded in memory, never written to snapshots or logs.
    if (buffer.length > 2000000) throw new Error('Unexpected oversized Claude event.');
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer.replace(/\r\n/g, '\n'));
  if (!measurement) throw new Error('Claude did not include quota numbers in this reply.');
  return measurement;
}

async function prepareConversation(client) {
  const uuid = crypto.randomUUID();
  const route = '/api/organizations/' + client.organization + '/chat_conversations';
  try {
    const created = await client.request(route, { method: 'POST', body: JSON.stringify({
      uuid, name: 'Claude Limits probe', is_temporary: true,
    }) });
    const conversation = await created.json();
    if (conversation.uuid !== uuid || conversation.is_temporary !== true) {
      throw new Error('Claude did not confirm a temporary probe conversation.');
    }
    return route + '/' + uuid;
  } catch (error) {
    void deleteConversation(client, route + '/' + uuid);
    throw error;
  }
}

async function deleteConversation(client, route) {
  try {
    const response = await client.request(route, { method: 'DELETE' });
    await response?.body?.cancel();
  } catch { } // Cleanup failure must not replace the measured quota or original error.
}

async function completeConversation(client, route) {
  // Never retry a completion automatically: a retry could spend more allowance.
  try {
    const response = await client.request(route + '/completion', {
      method: 'POST', headers: { Accept: 'text/event-stream' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ prompt: 'Reply with a single dot.', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        attachments: [], files: [], rendering_mode: 'messages' }),
    });
    return await readQuotaStream(response.body);
  } finally {
    // Cleanup targets only this helper's newly created or reserved conversation.
    // The long-lived helper finishes cleanup in the background; a slow DELETE
    // must not delay or discard a successful measurement (or the original error).
    void deleteConversation(client, route);
  }
}

async function probeQuota(client) {
  return completeConversation(client, await prepareConversation(client));
}

function createProber(client, { idleMs = 1800000 } = {}) {
  let reserved = null, closed = false;
  function reserve() {
    if (closed || reserved) return;
    const slot = { claimed: false, discarded: false, timer: null, promise: null };
    reserved = slot;
    // Reserve one empty chat, never a message or a quota reading. A failure
    // here is retriable setup; a completion is still attempted only once.
    slot.promise = prepareConversation(client).then(route => {
      if (closed || slot.discarded) {
        return deleteConversation(client, route).then(() => null);
      }
      if (!slot.claimed) {
        slot.timer = setTimeout(() => {
          if (reserved === slot) reserved = null;
          slot.discarded = true;
          void deleteConversation(client, route);
        }, idleMs);
        slot.timer.unref();
      }
      return route;
    }).catch(() => {
      if (reserved === slot) reserved = null;
      return null;
    });
  }
  return {
    async read() {
      if (closed) throw new Error('Claude probe helper stopped.');
      const slot = reserved;
      reserved = null;
      if (slot) { slot.claimed = true; clearTimeout(slot.timer); }
      let route = slot ? await slot.promise : null;
      if (!route) {
        if (closed) throw new Error('Claude probe helper stopped.');
        route = await prepareConversation(client);
      }
      // A stop during setup must not send a new message after the user stops.
      if (closed) { await deleteConversation(client, route); throw new Error('Claude probe helper stopped.'); }
      const result = await completeConversation(client, route);
      reserve();
      return result;
    },
    async close() {
      closed = true;
      const slot = reserved;
      reserved = null;
      if (!slot) return;
      clearTimeout(slot.timer);
      slot.discarded = true;
      const route = await slot.promise;
      if (route) await deleteConversation(client, route);
    },
  };
}

module.exports = { probeQuota, readQuotaStream, createProber };
