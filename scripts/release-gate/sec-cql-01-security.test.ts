import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildAuthEndpointUrls,
  resolveReachableBaseUrl,
  resolveVercelExecutable,
  shouldAllowConfiguredLoopbackBaseUrl,
} = require('./run.ts');
const {
  assertTrustedReleaseGateBaseUrl,
  assertTrustedReleaseGateProbeOrigin,
} = require('./url-policy.ts');

const DEPLOY_HOST_OPTIONS = { allowedExtraHostname: 'deploy.example.vercel.app' };
const RELEASE_GATE_HOST_ERROR = /release gate base url host is not allowed/i;

const assertThrowsMessage = (action, message) => assert.throws(action, { message });

test('resolveVercelExecutable rejects attacker-controlled executable overrides', () => {
  const resolved = resolveVercelExecutable({ VERCEL_BIN: process.execPath });
  assert.notEqual(resolved, process.execPath);
  if (resolved) assert.match(resolved, /\/vercel$/);
});

test('resolveReachableBaseUrl probes only trusted release-gate origins', async () => {
  const originalFetch = globalThis.fetch;
  const fetchTargets = [];
  globalThis.fetch = async input => {
    fetchTargets.push(String(input));
    return new Response('', { status: 200 });
  };

  try {
    const deployment = { deploymentUrl: 'https://deploy.example.vercel.app' };
    const noFallback = { allowDeploymentFallback: false };
    const rejected = await resolveReachableBaseUrl('http://127.0.0.1:3000', deployment, noFallback);
    assert.equal(rejected.source, 'configured_unreachable');
    assert.ok(rejected.failures[0].includes('Unsafe egress URL host'));
    assert.deepEqual(fetchTargets, []);

    const allowedUrl =
      'https://interdomestik-web.vercel.app/en/login?next=https://attacker.example';
    const allowed = await resolveReachableBaseUrl(allowedUrl, deployment, noFallback);
    assert.equal(allowed.baseUrl, allowedUrl);
    assert.deepEqual(fetchTargets, ['https://interdomestik-web.vercel.app/']);
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
  assertThrowsMessage(
    () => assertTrustedReleaseGateBaseUrl('https://attacker.example'),
    RELEASE_GATE_HOST_ERROR
  );
  assertThrowsMessage(
    () => assertTrustedReleaseGateBaseUrl('https://attacker.vercel.app'),
    RELEASE_GATE_HOST_ERROR
  );
  assert.equal(
    assertTrustedReleaseGateBaseUrl('https://deploy.example.vercel.app', DEPLOY_HOST_OPTIONS)
      .origin,
    'https://deploy.example.vercel.app'
  );
  const originalExtraHostname = process.env.RELEASE_GATE_EXTRA_HOSTNAME;
  try {
    process.env.RELEASE_GATE_EXTRA_HOSTNAME = 'deploy.example.vercel.app';
    const allowed = assertTrustedReleaseGateBaseUrl('https://deploy.example.vercel.app');
    assert.equal(allowed.origin, 'https://deploy.example.vercel.app');
  } finally {
    if (originalExtraHostname == null) delete process.env.RELEASE_GATE_EXTRA_HOSTNAME;
    else process.env.RELEASE_GATE_EXTRA_HOSTNAME = originalExtraHostname;
  }
  assertThrowsMessage(
    () => assertTrustedReleaseGateBaseUrl('https://attacker.vercel.app', DEPLOY_HOST_OPTIONS),
    RELEASE_GATE_HOST_ERROR
  );
});

test('release gate probe origin rejects protocol and port mismatches', () => {
  assert.equal(
    assertTrustedReleaseGateProbeOrigin('https://staging.interdomestik.com'),
    'https://staging.interdomestik.com'
  );
  for (const [url, options, message] of [
    ['http://staging.interdomestik.com', undefined, /must use https/i],
    ['https://staging.interdomestik.com:444', undefined, /default https port/i],
    ['https://deploy.example.vercel.app:444', DEPLOY_HOST_OPTIONS, /default https port/i],
  ]) {
    assertThrowsMessage(() => assertTrustedReleaseGateProbeOrigin(url, options), message);
  }
});

test('auth preflight URL builder returns trusted URL objects before fetch', () => {
  const urls = buildAuthEndpointUrls('https://staging.interdomestik.com');
  assert.equal(urls.origin, 'https://staging.interdomestik.com');
  assert.equal(
    urls.signInEmailUrl.href,
    'https://staging.interdomestik.com/api/auth/sign-in/email'
  );
  assert.ok(urls.endpoints.every(endpoint => endpoint.url instanceof URL));
  assertThrowsMessage(
    () => buildAuthEndpointUrls('https://attacker.example'),
    RELEASE_GATE_HOST_ERROR
  );
});

test('auth preflight allows only the exact validated deployment fallback host', () => {
  const urls = buildAuthEndpointUrls('https://deploy.example.vercel.app', DEPLOY_HOST_OPTIONS);
  assert.equal(urls.origin, 'https://deploy.example.vercel.app');
  assert.equal(
    urls.signInEmailUrl.href,
    'https://deploy.example.vercel.app/api/auth/sign-in/email'
  );
  assertThrowsMessage(
    () => buildAuthEndpointUrls('https://attacker.vercel.app', DEPLOY_HOST_OPTIONS),
    RELEASE_GATE_HOST_ERROR
  );
});

test('production release gate allows only trusted CI Playwright loopback base URL', () => {
  const loopback = 'http://127.0.0.1:3000';
  assert.equal(
    shouldAllowConfiguredLoopbackBaseUrl(loopback, 'production', {
      CI: 'true',
      PLAYWRIGHT: '1',
      NEXT_PUBLIC_APP_URL: loopback,
      BETTER_AUTH_URL: loopback,
    }),
    true
  );

  for (const env of [{ CI: 'true' }, { PLAYWRIGHT: '1', NEXT_PUBLIC_APP_URL: loopback }]) {
    assert.equal(shouldAllowConfiguredLoopbackBaseUrl(loopback, 'production', env), false);
  }
});
