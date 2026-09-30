'use strict';
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { makeClient } = require('./api.cjs');
const { probeQuota } = require('./probe.cjs');
const { createReader } = require('./measurement.cjs');
const runtime = require('./runtime.cjs');

(async () => {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 65536) throw new Error('Invalid service startup.');
  }
  const { session, token } = JSON.parse(input);
  input = '';
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local service token.');
  const expected = Buffer.from(token);
  const reader = createReader(makeClient(session), probeQuota, async result => {
    // Only percentages/reset timestamps are saved. Cookies and chats stay in memory.
    fs.writeFileSync(runtime.snapshotPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  });
  const server = net.createServer(socket => {
    socket.setTimeout(120000, () => socket.destroy());
    let request = '', answered = false;
    socket.on('error', () => {});
    socket.on('data', async chunk => {
      if (answered) return;
      request += chunk;
      if (request.length > 4096) return socket.destroy();
      if (!request.includes('\n')) return;
      answered = true;
      try {
        const message = JSON.parse(request.split('\n')[0]);
        const received = Buffer.from(String(message.token ?? ''));
        if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return socket.destroy();
        request = '';
        if (message.action === 'ping') socket.end(JSON.stringify({ connected: true }) + '\n');
        else if (message.action === 'read') socket.end(JSON.stringify({ result: await reader() }) + '\n');
        else if (message.action === 'stop') {
          socket.end(JSON.stringify({ stopped: true }) + '\n');
          server.close(() => process.exit(0));
        } else socket.end(JSON.stringify({ error: 'Invalid local command.' }) + '\n');
      } catch (error) {
        socket.end(JSON.stringify({ error: error.message }) + '\n');
      }
    });
  });
  server.on('error', () => process.exit(1));
  server.listen(runtime.pipe);
})().catch(() => process.exit(1));
