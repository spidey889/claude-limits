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

async function probeQuota(client) {
  const uuid = crypto.randomUUID();
  const route = '/api/organizations/' + client.organization + '/chat_conversations';
  const created = await client.request(route, { method: 'POST', body: JSON.stringify({
    uuid, name: 'Claude Limits probe', is_temporary: true,
  }) });
  // Never retry a completion automatically: a retry could spend more allowance.
  try {
    const conversation = await created.json();
    if (conversation.uuid !== uuid || conversation.is_temporary !== true) {
      throw new Error('Claude did not confirm a temporary probe conversation.');
    }
    const response = await client.request(route + '/' + uuid + '/completion', {
      method: 'POST', headers: { Accept: 'text/event-stream' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ prompt: 'Reply with a single dot.', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        attachments: [], files: [], rendering_mode: 'messages' }),
    });
    return await readQuotaStream(response.body);
  } finally {
    // Only the conversation created by this invocation is eligible for cleanup.
    // The long-lived helper finishes cleanup in the background; a slow DELETE
    // must not delay or discard a successful measurement (or the original error).
    void Promise.resolve().then(() => client.request(route + '/' + uuid, { method: 'DELETE' }))
      .then(response => response?.body?.cancel()).catch(() => {});
  }
}

module.exports = { probeQuota, readQuotaStream };
