import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { evaluateCertificationResult } from './exact-head-certification-result.mjs';

function evaluate(overrides = {}) {
  return evaluateCertificationResult({
    preflightResult: 'success',
    runBroad: false,
    certificationRequired: false,
    runAttempt: 1,
    runnerResult: 'skipped',
    reason: 'ordinary-draft',
    ...overrides,
  });
}

test('quick lane passes without a heavy runner', () => {
  assert.deepEqual(evaluate(), { ok: true, message: 'PR E2E skipped (ordinary-draft).' });
});

test('a stale ready head fails with the recertification action', () => {
  assert.deepEqual(evaluate({ certificationRequired: true }), {
    ok: false,
    message: 'This exact head requires broad certification. Apply the full-gate label.',
  });
});

test('broad certification requires a successful runner', () => {
  assert.equal(evaluate({ runBroad: true, runnerResult: 'failure' }).ok, false);
  assert.equal(evaluate({ runBroad: true, runnerResult: 'success' }).ok, true);
});

test('preflight failure is always non-pass', () => {
  assert.equal(evaluate({ preflightResult: 'failure' }).ok, false);
});

test('re-running only a historical quick result cannot certify the head', () => {
  assert.deepEqual(evaluate({ runAttempt: 2 }), {
    ok: false,
    message: 'A replayed lightweight E2E result cannot certify the current head.',
  });
});

test('a broad rerun still depends on successful broad evidence', () => {
  assert.equal(evaluate({ runAttempt: 2, runBroad: true, runnerResult: 'failure' }).ok, false);
  assert.equal(evaluate({ runAttempt: 2, runBroad: true, runnerResult: 'success' }).ok, true);
});

test('malformed result run-attempt evidence fails closed', () => {
  assert.throws(() => evaluate({ runAttempt: 0 }), /runAttempt/u);
});

test('result CLI rejects a replayed quick job', () => {
  const result = spawnSync(process.execPath, ['scripts/ci/exact-head-certification-result.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CERTIFICATION_REASON: 'ordinary-draft',
      CERTIFICATION_REQUIRED: 'false',
      GITHUB_RUN_ATTEMPT: '2',
      PREFLIGHT_RESULT: 'success',
      RUN_BROAD: 'false',
      RUNNER_RESULT: 'skipped',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /replayed lightweight/u);
});
