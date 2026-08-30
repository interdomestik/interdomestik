import assert from 'node:assert/strict';
import test from 'node:test';

import { assertHeavyProofExecution, planInvalidatedProofs } from './slice-rehearse-proof-plan.mjs';

const receipt = (lane, evidenceKey, reusable) => ({ lane, evidenceKey, reusable });

test('plans only invalidated or missing proof lanes in deterministic code-unit order', () => {
  const plan = planInvalidatedProofs({
    requiredLanes: ['pr-e2e', 'CodeQL', 'sonar'],
    decisions: [receipt('pr-e2e', 'a'.repeat(64), true), receipt('CodeQL', 'b'.repeat(64), false)],
  });

  assert.deepEqual(plan.reuse, ['pr-e2e']);
  assert.deepEqual(plan.run, ['CodeQL', 'sonar']);
});

test('enforces the no-duplicate-heavy-proof execution contract', () => {
  const ledger = new Set(['a'.repeat(64)]);
  assert.throws(
    () => assertHeavyProofExecution({ evidenceKey: 'a'.repeat(64), ledger }),
    /duplicate heavy proof is forbidden/u
  );
  assert.equal(assertHeavyProofExecution({ evidenceKey: 'b'.repeat(64), ledger }), true);
  assert.ok(ledger.has('b'.repeat(64)));
});

test('rejects ambiguous duplicate lane decisions instead of rerunning speculatively', () => {
  assert.throws(
    () =>
      planInvalidatedProofs({
        requiredLanes: ['pr-e2e'],
        decisions: [
          receipt('pr-e2e', 'a'.repeat(64), true),
          receipt('pr-e2e', 'b'.repeat(64), false),
        ],
      }),
    /lane decision must be unique/u
  );
});
