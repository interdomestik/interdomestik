import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSentryRequestUrl,
  findMissingScopes,
  normalizeSentryBaseUrl,
} from './sentry-alerts-lib.mjs';

test('findMissingScopes reports missing Sentry auth scopes for live apply', () => {
  assert.deepEqual(findMissingScopes(['alerts:read', 'org:read'], ['alerts:read']), []);
  assert.deepEqual(
    findMissingScopes(['alerts:read', 'org:read'], ['alerts:read', 'alerts:write']),
    ['alerts:write']
  );
});

test('normalizeSentryBaseUrl accepts only the canonical Sentry API origin', () => {
  assert.equal(normalizeSentryBaseUrl(), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl(null), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl(''), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl('https://sentry.io////'), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl('https://sentry.io'), 'https://sentry.io');
  assert.throws(() => normalizeSentryBaseUrl('https://sentry.io/api/'), {
    message: /must not include a path/i,
  });
});

test('normalizeSentryBaseUrl rejects unsafe local or non-HTTPS bases', () => {
  const insecureBase = ['http:', '', 'sentry.io'].join('/');
  assert.throws(() => normalizeSentryBaseUrl(insecureBase), {
    message: /must use HTTPS/i,
  });
  assert.throws(() => normalizeSentryBaseUrl('https://127.0.0.1:9000'), {
    message: /unsafe egress url host/i,
  });
});

test('assertSentryRequestUrl preserves request path, query, and trailing slash', () => {
  const parsed = assertSentryRequestUrl(
    'https://sentry.io/api/0/organizations/acme/alert-rules/?cursor=abc'
  );

  assert.equal(parsed.pathname, '/api/0/organizations/acme/alert-rules/');
  assert.equal(parsed.search, '?cursor=abc');
});
