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

test('auth endpoint preflight retries a nested transient transport cause', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts < 3) {
      const cause = Object.assign(new Error('getaddrinfo EAI_AGAIN secret.invalid'), {
        code: 'EAI_AGAIN',
        hostname: 'interdomestik-preview.vercel.app',
        syscall: 'getaddrinfo',
      });
      throw new TypeError('fetch failed', { cause });
    }
    return new Response(null, { status: 204 });
  };

  try {
    const result = await runAuthEndpointPreflight(baseRunContext);

    assert.equal(result.status, 'PASS');
    assert.equal(attempts, 4);
    assert.equal(result.signatures.length, 0);
    assert.equal(result.evidence.filter(line => line.includes('code=EAI_AGAIN')).length, 2);
    assert.ok(result.evidence.every(line => !line.includes('secret.invalid')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auth endpoint preflight caps transient retries and reports only sanitized cause metadata', async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    const cause = Object.assign(
      new Error('getaddrinfo ENOTFOUND staging.interdomestik.com?token=do-not-log'),
      {
        code: 'ENOTFOUND',
        hostname: 'staging.interdomestik.com',
        syscall: 'getaddrinfo',
      }
    );
    throw new TypeError('fetch failed', { cause });
  };

  try {
    const result = await runAuthEndpointPreflight(baseRunContext);

    assert.equal(result.status, 'FAIL');
    assert.equal(attempts, 3);
    assert.match(
      result.signatures[0],
      /AUTH_PREFLIGHT_INFRA_NETWORK.*phase=dns code=ENOTFOUND host=canonical retryable=true/u
    );
    assert.ok(result.evidence.every(line => !line.includes('do-not-log')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auth endpoint preflight does not retry TLS certificate or application failures', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const failure of [
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('certificate mismatch'), {
          code: 'ERR_TLS_CERT_ALTNAME_INVALID',
          hostname: 'interdomestik-preview.vercel.app',
        }),
      }),
      Object.assign(new Error('authentication rejected'), { code: 'AUTH_DENIED' }),
    ]) {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts += 1;
        throw failure;
      };

      const result = await runAuthEndpointPreflight(baseRunContext);

      assert.equal(result.status, 'FAIL');
      assert.equal(attempts, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
