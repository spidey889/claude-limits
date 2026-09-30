'use strict';
const { parseUsage } = require('./usage.cjs');
const ORIGIN = 'https://claude.ai';

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
