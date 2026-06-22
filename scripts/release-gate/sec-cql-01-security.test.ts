import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildAuthEndpointUrls,
  resolveReachableBaseUrl,
  resolveVercelExecutable,
  shouldAllowConfiguredLoopbackBaseUrl,
} = require('./run.ts');
const { assertTrustedReleaseGateBaseUrl } = require('./url-policy.ts');

test('resolveVercelExecutable rejects attacker-controlled executable overrides', () => {
  const resolved = resolveVercelExecutable({ VERCEL_BIN: process.execPath });
  assert.notEqual(resolved, process.execPath);
  if (resolved) assert.match(resolved, /\/vercel$/);
});

test('resolveReachableBaseUrl rejects loopback targets unless explicitly allowed', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });

  try {
    const rejected = await resolveReachableBaseUrl('http://127.0.0.1:3000', {
      deploymentUrl: 'https://deploy.example.vercel.app',
    });
    assert.equal(rejected.source, 'deployment_fallback');
    assert.equal(rejected.allowedExtraHostname, 'deploy.example.vercel.app');
    assert.ok(rejected.failures[0].includes('Unsafe egress URL host'));

    const allowed = await resolveReachableBaseUrl(
      'http://127.0.0.1:3000',
      { deploymentUrl: 'https://deploy.example.vercel.app' },
      { allowLoopback: true }
    );
    assert.equal(allowed.baseUrl, 'http://127.0.0.1:3000');
    assert.equal(allowed.source, 'configured');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('release gate base URL policy rejects untrusted public egress hosts', () => {
  assert.equal(
    assertTrustedReleaseGateBaseUrl('https://interdomestik-web.vercel.app').origin,
    'https://interdomestik-web.vercel.app'
  );
  assert.equal(
    assertTrustedReleaseGateBaseUrl('https://app.interdomestik.com').origin,
    'https://app.interdomestik.com'
  );
  assert.throws(() => assertTrustedReleaseGateBaseUrl('https://attacker.example'), {
    message: /release gate base url host is not allowed/i,
  });
  assert.throws(() => assertTrustedReleaseGateBaseUrl('https://attacker.vercel.app'), {
    message: /release gate base url host is not allowed/i,
  });
  assert.equal(
    assertTrustedReleaseGateBaseUrl('https://deploy.example.vercel.app', {
      allowedExtraHostname: 'deploy.example.vercel.app',
    }).origin,
    'https://deploy.example.vercel.app'
  );
  assert.throws(
    () =>
      assertTrustedReleaseGateBaseUrl('https://attacker.vercel.app', {
        allowedExtraHostname: 'deploy.example.vercel.app',
      }),
    {
      message: /release gate base url host is not allowed/i,
    }
  );
});

test('auth preflight URL builder returns trusted URL objects before fetch', () => {
  const urls = buildAuthEndpointUrls('https://staging.interdomestik.com');
  assert.equal(urls.origin, 'https://staging.interdomestik.com');
  assert.equal(
    urls.signInEmailUrl.href,
    'https://staging.interdomestik.com/api/auth/sign-in/email'
  );
  assert.ok(urls.endpoints.every(endpoint => endpoint.url instanceof URL));
  assert.throws(() => buildAuthEndpointUrls('https://attacker.example'), {
    message: /release gate base url host is not allowed/i,
  });
  assert.throws(() => buildAuthEndpointUrls('https://attacker.vercel.app'), {
    message: /release gate base url host is not allowed/i,
  });
});

test('auth preflight allows only the exact validated deployment fallback host', () => {
  const urls = buildAuthEndpointUrls('https://deploy.example.vercel.app', {
    allowedExtraHostname: 'deploy.example.vercel.app',
  });
  assert.equal(urls.origin, 'https://deploy.example.vercel.app');
  assert.equal(
    urls.signInEmailUrl.href,
    'https://deploy.example.vercel.app/api/auth/sign-in/email'
  );

  assert.throws(
    () =>
      buildAuthEndpointUrls('https://attacker.vercel.app', {
        allowedExtraHostname: 'deploy.example.vercel.app',
      }),
    {
      message: /release gate base url host is not allowed/i,
    }
  );
});

test('production release gate allows only trusted CI Playwright loopback base URL', () => {
  assert.equal(
    shouldAllowConfiguredLoopbackBaseUrl('http://127.0.0.1:3000', 'production', {
      CI: 'true',
      PLAYWRIGHT: '1',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
      BETTER_AUTH_URL: 'http://127.0.0.1:3000',
    }),
    true
  );

  assert.equal(
    shouldAllowConfiguredLoopbackBaseUrl('http://127.0.0.1:3000', 'production', {
      CI: 'true',
      PLAYWRIGHT: '1',
      NEXT_PUBLIC_APP_URL: 'https://interdomestik-web.vercel.app',
      BETTER_AUTH_URL: 'https://interdomestik-web.vercel.app',
    }),
    false
  );

  assert.equal(
    shouldAllowConfiguredLoopbackBaseUrl('http://127.0.0.1:3000', 'production', {
      PLAYWRIGHT: '1',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000',
    }),
    false
  );
});
