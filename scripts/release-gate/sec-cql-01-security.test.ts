import assert from 'node:assert/strict';
import test from 'node:test';

const {
  resolveReachableBaseUrl,
  resolveVercelExecutable,
  shouldAllowConfiguredLoopbackBaseUrl,
} = require('./run.ts');

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
