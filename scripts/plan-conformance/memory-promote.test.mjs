import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPromotion, evaluateMemoryPromotion } from './memory-promote.mjs';

const POLICY = {
  transitions: {
    candidate: ['validated', 'obsolete'],
    validated: ['canonical', 'obsolete'],
    canonical: ['obsolete'],
    obsolete: [],
  },
  approval_rules: {
    auto_policy: {
      canonical: {
        allowed_approval_types: ['auto_policy'],
        requires_approver: false,
        requires_auto_policy_pass: true,
      },
    },
    owner_approval: {
      canonical: {
        allowed_approval_types: ['owner', 'hitl'],
        requires_approver: true,
        requires_auto_policy_pass: false,
      },
    },
    hitl_required: {
      canonical: {
        allowed_approval_types: ['hitl'],
        requires_approver: true,
        requires_auto_policy_pass: false,
      },
    },
  },
  default_transition_requirements: {
    allowed_approval_types: ['auto_policy', 'owner', 'hitl'],
    requires_approver: false,
    requires_auto_policy_pass: false,
  },
};

function makeRecord(overrides) {
  return {
    id: 'mem_promote_1',
    status: 'validated',
    promotion_rule: 'hitl_required',
    updated_at: '2026-03-04T00:00:00.000Z',
    ...overrides,
  };
}

test('requires HITL approval for hitl_required canonical promotion', () => {
  const decision = evaluateMemoryPromotion({
    record: makeRecord({ promotion_rule: 'hitl_required' }),
    toStatus: 'canonical',
    approvalType: 'owner',
    approvedBy: 'platform.owner',
    autoPolicyPass: false,
    policy: POLICY,
  });

  assert.equal(decision.pass_fail, false);
  assert.match(decision.reasons.join(' | '), /approval_type must be one of: hitl/);
});

test('allows canonical promotion with HITL approval for hitl_required', () => {
  const decision = evaluateMemoryPromotion({
    record: makeRecord({ promotion_rule: 'hitl_required' }),
    toStatus: 'canonical',
    approvalType: 'hitl',
    approvedBy: 'security.owner',
    autoPolicyPass: false,
    policy: POLICY,
  });

  assert.equal(decision.pass_fail, true);
  assert.deepEqual(decision.reasons, []);
});

test('auto_policy canonical promotion requires auto_policy_pass', () => {
  const failDecision = evaluateMemoryPromotion({
    record: makeRecord({ promotion_rule: 'auto_policy' }),
    toStatus: 'canonical',
    approvalType: 'auto_policy',
    approvedBy: '',
    autoPolicyPass: false,
    policy: POLICY,
  });

  assert.equal(failDecision.pass_fail, false);
  assert.match(failDecision.reasons.join(' | '), /auto_policy_pass must be true/);

  const passDecision = evaluateMemoryPromotion({
    record: makeRecord({ promotion_rule: 'auto_policy' }),
    toStatus: 'canonical',
    approvalType: 'auto_policy',
    approvedBy: '',
    autoPolicyPass: true,
    policy: POLICY,
  });

  assert.equal(passDecision.pass_fail, true);
});

test('rejects invalid status transition', () => {
  const decision = evaluateMemoryPromotion({
    record: makeRecord({ status: 'candidate', promotion_rule: 'owner_approval' }),
    toStatus: 'canonical',
    approvalType: 'owner',
    approvedBy: 'platform.owner',
    autoPolicyPass: false,
    policy: POLICY,
  });

  assert.equal(decision.pass_fail, false);
  assert.match(decision.reasons.join(' | '), /transition not allowed: candidate -> canonical/);
});

test('applyPromotion updates target record status and updated_at', () => {
  const records = [
    makeRecord({ id: 'mem_a', status: 'validated' }),
    makeRecord({ id: 'mem_b', status: 'candidate' }),
  ];

  const now = '2026-03-04T07:39:00.000Z';
  const updated = applyPromotion(records, 'mem_a', 'canonical', now);

  assert.equal(updated[0].status, 'canonical');
  assert.equal(updated[0].updated_at, now);
  assert.equal(updated[1].status, 'candidate');
});
