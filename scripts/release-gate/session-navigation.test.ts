import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const { buildRoute } = require('./shared.ts');
const { gotoWithSessionRetry, resolveReachableBaseUrl } = require('./session-navigation.ts');

const originalFetch = globalThis.fetch;
const originalExtraHostname = process.env.RELEASE_GATE_EXTRA_HOSTNAME;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalExtraHostname == null) delete process.env.RELEASE_GATE_EXTRA_HOSTNAME;
  else process.env.RELEASE_GATE_EXTRA_HOSTNAME = originalExtraHostname;
});

test('resolveReachableBaseUrl normalizes accepted configured base URLs', async () => {
  process.env.RELEASE_GATE_EXTRA_HOSTNAME = 'deploy.example.vercel.app';
  globalThis.fetch = async () => new Response('', { status: 307 });

  const resolved = await resolveReachableBaseUrl('https://deploy.example.vercel.app/', {
    deploymentUrl: 'unknown',
  });

  assert.equal(resolved.baseUrl, 'https://deploy.example.vercel.app');
  assert.equal(
    buildRoute(resolved.baseUrl, 'en', '/member'),
    'https://deploy.example.vercel.app/en/member'
  );
});

test('resolveReachableBaseUrl normalizes accepted deployment fallback URLs', async () => {
  let attempt = 0;
  globalThis.fetch = async input => {
    attempt += 1;
    if (String(input).includes('interdomestik-web.vercel.app')) {
      throw new Error('unreachable');
    }
    return new Response('', { status: 200 });
  };

  const resolved = await resolveReachableBaseUrl(
    'https://interdomestik-web.vercel.app/',
    { deploymentUrl: 'https://deploy.example.vercel.app/' },
    { allowDeploymentFallback: true, allowedDeploymentHostname: 'deploy.example.vercel.app' }
  );

  assert.equal(attempt, 4);
  assert.equal(resolved.baseUrl, 'https://deploy.example.vercel.app');
  assert.equal(
    buildRoute(resolved.baseUrl, 'en', '/agent'),
    'https://deploy.example.vercel.app/en/agent'
  );
});

test('gotoWithSessionRetry settles a navigation race without forcing a fresh login', async () => {
  let navigationAttempts = 0;
  let loginAttempts = 0;
  const intendedRoute = 'https://staging.interdomestik.com/en/member';

  const result = await gotoWithSessionRetry({
    page: {
      url: () => intendedRoute,
    },
    navigate: async () => {
      navigationAttempts += 1;
      if (navigationAttempts === 1) {
        throw new Error(
          `page.goto: Navigation to "${intendedRoute}" is interrupted by another navigation to ` +
            '"https://staging.interdomestik.com/en/admin/overview"'
        );
      }
    },
    retryLogin: async () => {
      loginAttempts += 1;
    },
  });

  assert.equal(result, intendedRoute);
  assert.equal(navigationAttempts, 2);
  assert.equal(loginAttempts, 0);
});

test('gotoWithSessionRetry keeps ERR_ABORTED on the existing fresh-login path', async () => {
  let navigationAttempts = 0;
  let loginAttempts = 0;
  const intendedRoute = 'https://staging.interdomestik.com/en/admin';

  const result = await gotoWithSessionRetry({
    page: {
      url: () => intendedRoute,
    },
    navigate: async () => {
      navigationAttempts += 1;
      if (navigationAttempts === 1) {
        throw new Error(`page.goto: net::ERR_ABORTED at ${intendedRoute}`);
      }
    },
    retryLogin: async () => {
      loginAttempts += 1;
    },
  });

  assert.equal(result, intendedRoute);
  assert.equal(navigationAttempts, 2);
  assert.equal(loginAttempts, 1);
});
