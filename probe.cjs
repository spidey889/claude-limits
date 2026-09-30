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
  const conversation = await created.json();
  // Never retry a completion automatically: a retry could spend more allowance.
  try {
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
    // Failed cleanup must not discard a successful quota measurement.
    await client.request(route + '/' + uuid, { method: 'DELETE' }).catch(() => {});
  }
}

module.exports = { probeQuota, readQuotaStream };
