import assert from 'node:assert/strict';
import test from 'node:test';

const { runAuthEndpointPreflight } = require('./run.ts');

const baseRunContext = {
  baseUrl: 'https://interdomestik-preview.vercel.app/',
  authOrigin: 'https://staging.interdomestik.com',
  locale: 'en',
  envName: 'staging',
  allowedExtraHostname: 'interdomestik-preview.vercel.app',
};

test('auth endpoint preflight accepts canonical 307 and 308 redirects', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response('', {
      status: 307,
      headers: { Location: '/api/auth/get-session/?disableCookieCache=true&disableRefresh=true' },
    }),
    new Response('', {
      status: 308,
      headers: { Location: 'https://interdomestik-preview.vercel.app/api/auth/sign-in/email/' },
    }),
  ];
  globalThis.fetch = async () => responses.shift() ?? new Response('', { status: 308 });

  try {
    const result = await runAuthEndpointPreflight(baseRunContext);

    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.signatures, []);
    assert.ok(result.evidence.some(line => line.includes('status=307')));
    assert.ok(result.evidence.some(line => line.includes('status=308')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auth endpoint preflight rejects redirects outside the trusted auth path', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('', {
      status: 307,
      headers: { Location: 'https://interdomestik-preview.vercel.app/login' },
    });

  try {
    const result = await runAuthEndpointPreflight(baseRunContext);

    assert.equal(result.status, 'FAIL');
    assert.match(result.signatures[0], /AUTH_PREFLIGHT_ENDPOINT_UNHEALTHY/);
    assert.match(result.signatures[0], /status=307/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auth endpoint preflight rejects redirects to another origin', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('', {
      status: 308,
      headers: { Location: 'https://vercel.com/sso' },
    });

  try {
    const result = await runAuthEndpointPreflight(baseRunContext);

    assert.equal(result.status, 'FAIL');
    assert.match(result.signatures[0], /AUTH_PREFLIGHT_ENDPOINT_UNHEALTHY/);
    assert.match(result.signatures[0], /status=308/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auth endpoint preflight keeps 302 redirects unhealthy', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 302 });

  try {
    const result = await runAuthEndpointPreflight(baseRunContext);

    assert.equal(result.status, 'FAIL');
    assert.equal(result.signatures.length, 1);
    assert.match(result.signatures[0], /AUTH_PREFLIGHT_ENDPOINT_UNHEALTHY/);
    assert.match(result.signatures[0], /status=302/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
