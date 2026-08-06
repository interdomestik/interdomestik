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

test('ordinary draft synchronization stays focused', () => {
  assert.deepEqual(evaluate(), {
    runBroad: false,
    certificationRequired: false,
    consumeFullGate: false,
    reason: 'ordinary-draft',
  });
});

for (const action of ['opened', 'reopened', 'ready_for_review']) {
  test(`${action} certifies a ready same-repository head`, () => {
    const result = evaluate({ action, draft: false, policyRunFull: true });
    assert.equal(result.runBroad, true);
    assert.equal(result.certificationRequired, false);
    assert.equal(result.reason, 'exact-head-certification');
  });
}

test('a later ordinary ready synchronization fails closed until recertified', () => {
  assert.deepEqual(
    evaluate({ draft: false, policyRunFull: true, policyReason: 'pull-request-ready' }),
    {
      runBroad: false,
      certificationRequired: true,
      consumeFullGate: false,
      reason: 'exact-head-certification-required',
    }
  );
});

test('a newly applied full-gate label is a one-shot certification command', () => {
  assert.deepEqual(
    evaluate({
      action: 'labeled',
      draft: false,
      labelName: 'full-gate',
      policyRunFull: true,
      policyForceFull: true,
      policyReason: 'full-gate-label',
    }),
    {
      runBroad: true,
      certificationRequired: false,
      consumeFullGate: true,
      reason: 'exact-head-certification',
    }
  );
});

test('an unrelated label cannot certify a ready head', () => {
  const result = evaluate({
    action: 'labeled',
    draft: false,
    labelName: 'documentation',
    policyRunFull: true,
    policyReason: 'pull-request-ready',
  });
  assert.equal(result.runBroad, false);
  assert.equal(result.certificationRequired, true);
  assert.equal(result.reason, 'exact-head-certification-required');
});

test('an unrelated label keeps a draft head focused', () => {
  const result = evaluate({
    action: 'labeled',
    draft: true,
    labelName: 'documentation',
    policyRunFull: false,
    policyReason: 'ordinary-draft',
  });
  assert.equal(result.runBroad, false);
  assert.equal(result.certificationRequired, false);
  assert.equal(result.reason, 'unrelated-label');
});

for (const policyReason of ['high-risk-change', 'changed-files-incomplete']) {
  test(`${policyReason} preserves the full lane`, () => {
    const result = evaluate({
      draft: false,
      policyRunFull: true,
      policyForceFull: true,
      policyReason,
    });
    assert.equal(result.runBroad, true);
    assert.equal(result.certificationRequired, false);
    assert.equal(result.reason, policyReason);
  });
}

test('a retained full-gate label fails conservatively full', () => {
  const result = evaluate({
    draft: false,
    policyRunFull: true,
    policyForceFull: true,
    policyReason: 'full-gate-label',
  });
  assert.equal(result.runBroad, true);
  assert.equal(result.consumeFullGate, false);
});

test('non-product-only changes stay lightweight', () => {
  const result = evaluate({
    action: 'ready_for_review',
    draft: false,
    policyShouldRun: false,
    policyRunFull: true,
    policyReason: 'non_product_only_pr',
  });
  assert.equal(result.runBroad, false);
  assert.equal(result.certificationRequired, false);
});

test('fork pull requests require a maintainer same-repository handoff', () => {
  assert.deepEqual(evaluate({ sameRepository: false }), {
    runBroad: false,
    certificationRequired: true,
    consumeFullGate: false,
    reason: 'same-repository-certification-required',
  });
});

test('non-PR events preserve the pinned policy decision', () => {
  const result = evaluate({ eventName: 'push', policyRunFull: true });
  assert.equal(result.runBroad, true);
  assert.equal(result.certificationRequired, false);
});
