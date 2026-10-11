'use strict';
const net = require('node:net');
const runtime = require('./runtime.cjs');

async function withStartupLock(task, { pipe = runtime.pipe + '-connect', timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const guard = net.createServer(socket => socket.destroy());
    const error = await new Promise(resolve => {
      guard.once('error', resolve);
      guard.listen(pipe, () => resolve(null));
    });
    if (!error) {
      try { return await task(); }
      finally { await new Promise(resolve => guard.close(resolve)); }
    }
    guard.close();
    if (error.code !== 'EADDRINUSE') throw error;
    if (Date.now() >= deadline) throw new Error('Claude is still reconnecting. Try again in a moment.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

module.exports = { withStartupLock };
