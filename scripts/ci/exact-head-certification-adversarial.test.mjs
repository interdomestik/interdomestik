import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateExactHeadCertification } from './exact-head-certification-lib.mjs';

function evaluate(overrides = {}) {
  return evaluateExactHeadCertification({
    eventName: 'pull_request',
    action: 'synchronize',
    draft: true,
    labelName: '',
    sameRepository: true,
    runAttempt: 1,
    policyShouldRun: true,
    policyRunFull: false,
    policyForceFull: false,
    policyReason: 'ordinary-draft',
    ...overrides,
  });
}

test('a replayed lightweight run cannot certify an unchanged head', () => {
  assert.deepEqual(evaluate({ runAttempt: 2 }), {
    runBroad: false,
    certificationRequired: true,
    consumeFullGate: false,
    reason: 'workflow-rerun-certification-required',
  });
});

test('a replayed broad run remains broad', () => {
  const result = evaluate({
    action: 'ready_for_review',
    draft: false,
    policyRunFull: true,
    runAttempt: 2,
  });
  assert.equal(result.runBroad, true);
  assert.equal(result.certificationRequired, false);
});

test('a replayed full-gate run never consumes the one-shot label twice', () => {
  const result = evaluate({
    action: 'labeled',
    draft: false,
    labelName: 'full-gate',
    policyRunFull: true,
    policyForceFull: true,
    policyReason: 'full-gate-label',
    runAttempt: 2,
  });
  assert.equal(result.runBroad, true);
  assert.equal(result.consumeFullGate, false);
});

test('malformed run-attempt evidence fails closed', () => {
  assert.throws(() => evaluate({ runAttempt: 0 }), /runAttempt/u);
});

test('malformed policy booleans fail closed', () => {
  assert.throws(() => evaluate({ policyShouldRun: undefined }), /policyShouldRun/u);
});

test('unsupported pull-request actions fail closed', () => {
  assert.deepEqual(evaluate({ action: 'edited', draft: false }), {
    runBroad: false,
    certificationRequired: true,
    consumeFullGate: false,
    reason: 'unsupported-pull-request-action',
  });
});

test('unknown ready/draft state fails closed', () => {
  assert.throws(() => evaluate({ draft: undefined }), /draft/u);
});
