import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildRouteAllowingLocalePath,
  computeRetryDelayMs,
  parseRetryAfterSeconds,
  sessionCacheKeyForAccount,
} = require('./run.ts');
const { checkPortalMarkers } = require('./shared.ts');
const { SELECTORS } = require('./config.ts');

test('parseRetryAfterSeconds parses integer seconds value', () => {
  assert.equal(parseRetryAfterSeconds('15', 0), 15);
});

test('parseRetryAfterSeconds parses HTTP date values', () => {
  const nowMs = Date.parse('2026-02-21T00:00:00.000Z');
  const retryAt = new Date(nowMs + 6_000).toUTCString();
  assert.equal(parseRetryAfterSeconds(retryAt, nowMs), 6);
});

test('computeRetryDelayMs keeps jitter within expected bounds', () => {
  const minDelay = computeRetryDelayMs({
    attempt: 1,
    retryAfterSeconds: 2,
    randomFn: () => 0,
  });
  const maxDelay = computeRetryDelayMs({
    attempt: 1,
    retryAfterSeconds: 2,
    randomFn: () => 0.999999,
  });

  assert.equal(minDelay.baseMs, 2_000);
  assert.equal(minDelay.jitterMs, 100);
  assert.equal(maxDelay.jitterMs, 350);
  assert.equal(minDelay.totalMs, 2_100);
  assert.equal(maxDelay.totalMs, 2_350);
});

test('sessionCacheKeyForAccount keys cache by account label', () => {
  assert.equal(sessionCacheKeyForAccount('admin_ks'), 'Admin-(KS)');
  assert.equal(sessionCacheKeyForAccount('member'), 'Member-only');
});

test('buildRouteAllowingLocalePath avoids duplicate locale prefixes', () => {
  const baseUrl = 'https://interdomestik-web.vercel.app';
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', '/en/staff/claims/claim_123'),
    'https://interdomestik-web.vercel.app/en/staff/claims/claim_123'
  );
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', '/staff/claims/claim_123'),
    'https://interdomestik-web.vercel.app/en/staff/claims/claim_123'
  );
});

test('buildRouteAllowingLocalePath handles edge cases', () => {
  const baseUrl = 'https://interdomestik-web.vercel.app';

  // 1) Absolute URL should be returned as-is
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', 'https://example.com/path'),
    'https://example.com/path'
  );

  // 2) Path without leading slash should be normalized
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', 'staff/claims/claim_123'),
    'https://interdomestik-web.vercel.app/en/staff/claims/claim_123'
  );

  // 3) Just the locale path should not get duplicated
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', '/en'),
    'https://interdomestik-web.vercel.app/en'
  );

  // 4) Different locale should behave the same way
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'fr', '/dashboard'),
    'https://interdomestik-web.vercel.app/fr/dashboard'
  );
});

test('checkPortalMarkers treats Next fallback 404 template as not-found marker', async () => {
  const page = {
    getByTestId(testId) {
      return {
        isVisible: async () => false,
      };
    },
    locator(selector) {
      return {
        isVisible: async () => selector === SELECTORS.userRolesTable,
        count: async () => (selector === SELECTORS.notFoundFallbackTemplate ? 1 : 0),
      };
    },
  };

  const markers = await checkPortalMarkers(page);
  assert.equal(markers.notFound, true);
  assert.equal(markers.rolesTable, true);
});
