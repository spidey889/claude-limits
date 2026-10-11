'use strict';
const { parseUsage, parseLimitError } = require('./usage.cjs');
const ORIGIN = 'https://claude.ai';

async function limitMeasurement(response) {
  // Inspect only bounded JSON metadata. Never print/store the error text,
  // account fields, or whole response, even when no usable quota is present.
  try {
    if (!response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel();
      return null;
    }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 65536) return null;
      chunks.push(chunk);
    }
    const usage = parseLimitError(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    return usage ? { usage, observedAt: new Date().toISOString(), source: 'limit-error' } : null;
  } catch { return null; }
}

function makeClient(session, fetchImpl = fetch) {
  const cookie = Object.entries(session.cookies).map(([key, value]) => key + '=' + value).join('; ');
  const headers = {
    Cookie: cookie, Accept: 'application/json', 'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };
  async function request(route, options = {}) {
    // Never follow redirects: an authenticated request must stay on Claude's host.
    if (!route.startsWith('/api/') || /[\r\n]/.test(route)) throw new Error('Invalid Claude route.');
    const response = await fetchImpl(ORIGIN + route, {
      ...options, headers: { ...headers, ...options.headers }, redirect: 'error',
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Claude session expired. Sign in again.');
      if (response.headers.get('cf-mitigated') === 'challenge') throw new Error('Claude requires a browser verification.');
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const wait = /^\d{1,9}$/.test(retry ?? '') && Number(retry) > 0
          ? 'Try again in ' + Number(retry) + ' seconds.' : 'Try again later.';
        const error = new Error('Claude rate-limited this check (HTTP 429). Exact usage unavailable. ' + wait);
        error.status = 429;
        error.measurement = await limitMeasurement(response);
        throw error;
      }
      throw new Error('Claude request failed (HTTP ' + response.status + ').');
    }
    return response;
  }
  return {
    request,
    async usage() {
      const response = await request('/api/organizations/' + session.organization + '/usage');
      return parseUsage(await response.json());
    },
    organization: session.organization,
  };
}

module.exports = { makeClient };
