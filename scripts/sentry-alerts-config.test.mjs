import assert from 'node:assert/strict';
import test from 'node:test';

import { findMissingScopes, normalizeSentryBaseUrl } from './sentry-alerts-lib.mjs';

test('findMissingScopes reports missing Sentry auth scopes for live apply', () => {
  assert.deepEqual(findMissingScopes(['alerts:read', 'org:read'], ['alerts:read']), []);
  assert.deepEqual(
    findMissingScopes(['alerts:read', 'org:read'], ['alerts:read', 'alerts:write']),
    ['alerts:write']
  );
});

test('normalizeSentryBaseUrl trims trailing slashes without changing the origin', () => {
  assert.equal(normalizeSentryBaseUrl(), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl(null), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl(''), 'https://sentry.io');
  assert.equal(normalizeSentryBaseUrl('https://sentry.io////'), 'https://sentry.io');
  assert.equal(
    normalizeSentryBaseUrl('https://self-hosted.sentry.local/api/'),
    'https://self-hosted.sentry.local/api'
  );
  assert.equal(normalizeSentryBaseUrl('https://sentry.io'), 'https://sentry.io');
});
