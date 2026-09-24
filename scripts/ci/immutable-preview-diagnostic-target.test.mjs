import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPROVED_PREVIEW_ORIGIN,
  EXPECTED_COMMIT_SHA,
  assertApprovedPreviewOrigin,
  createReadOnlyRequestPolicy,
} from './immutable-preview-diagnostic-lib.mjs';
import {
  IMMUTABLE_PREVIEW_DIAGNOSTIC_TARGET,
  validateImmutablePreviewDiagnosticTarget,
} from './immutable-preview-diagnostic-target.mjs';

const PINNED_PREVIEW_ORIGIN = 'https://interdomestik-9tjrc8i34-ecohub.vercel.app';
const PINNED_COMMIT_SHA = 'a5dd1e455628b7c9826c80683237adcbd0d2d4f3';

test('request policy accepts only the exact approved immutable preview origin', () => {
  assert.equal(APPROVED_PREVIEW_ORIGIN, PINNED_PREVIEW_ORIGIN);
  assert.equal(assertApprovedPreviewOrigin(APPROVED_PREVIEW_ORIGIN), APPROVED_PREVIEW_ORIGIN);

  const rejectedOrigins = [
    'http://interdomestik-9tjrc8i34-ecohub.vercel.app',
    'https://staging.interdomestik.com',
    'https://interdomestik-9tjrc8i34-ecohub.vercel.app.attacker.example',
    'https://interdomestik-9tjrc8i34-ecohub.vercel.app/path',
    'https://user:password@interdomestik-9tjrc8i34-ecohub.vercel.app',
  ];
  for (const rejected of rejectedOrigins) {
    assert.throws(
      () => assertApprovedPreviewOrigin(rejected),
      /approved immutable preview origin/u
    );
    assert.throws(
      () => createReadOnlyRequestPolicy(rejected),
      /approved immutable preview origin/u
    );
  }
});

test('target validator accepts only a bare HTTPS origin and lowercase full SHA', () => {
  assert.equal(IMMUTABLE_PREVIEW_DIAGNOSTIC_TARGET.origin, PINNED_PREVIEW_ORIGIN);
  assert.equal(IMMUTABLE_PREVIEW_DIAGNOSTIC_TARGET.expectedCommitSha, PINNED_COMMIT_SHA);
  assert.equal(APPROVED_PREVIEW_ORIGIN, PINNED_PREVIEW_ORIGIN);
  assert.equal(EXPECTED_COMMIT_SHA, PINNED_COMMIT_SHA);
  assert.match(EXPECTED_COMMIT_SHA, /^[0-9a-f]{40}$/u);
  assert.equal(Object.isFrozen(IMMUTABLE_PREVIEW_DIAGNOSTIC_TARGET), true);

  assert.throws(() => validateImmutablePreviewDiagnosticTarget(null), /target must be an object/u);
  for (const origin of [
    'http://interdomestik-example-ecohub.vercel.app',
    'https://user:password@interdomestik-example-ecohub.vercel.app',
    'https://interdomestik-example-ecohub.vercel.app/path',
    'https://interdomestik-example-ecohub.vercel.app?query=true',
    'https://interdomestik-example-ecohub.vercel.app#fragment',
    'https://interdomestik-example-ecohub.vercel.app/',
    'not-a-url',
  ]) {
    assert.throws(
      () =>
        validateImmutablePreviewDiagnosticTarget({
          origin,
          expectedCommitSha: EXPECTED_COMMIT_SHA,
        }),
      /bare HTTPS origin/u
    );
  }
  for (const origin of [
    'https://attacker.example',
    'https://interdomestik-example-ecohub.vercel.app:8443',
  ]) {
    assert.throws(
      () =>
        validateImmutablePreviewDiagnosticTarget({
          origin,
          expectedCommitSha: EXPECTED_COMMIT_SHA,
        }),
      /approved Vercel preview host/u
    );
  }
  for (const expectedCommitSha of ['0'.repeat(39), 'A'.repeat(40), 'not-a-sha']) {
    assert.throws(
      () =>
        validateImmutablePreviewDiagnosticTarget({
          origin: APPROVED_PREVIEW_ORIGIN,
          expectedCommitSha,
        }),
      /40 lowercase hexadecimal/u
    );
  }
  assert.throws(
    () =>
      validateImmutablePreviewDiagnosticTarget({
        origin: APPROVED_PREVIEW_ORIGIN,
        expectedCommitSha: { toString: () => EXPECTED_COMMIT_SHA },
      }),
    /40 lowercase hexadecimal/u
  );
});
