import assert from 'node:assert/strict';
import test from 'node:test';

import { isSemanticGovernanceDocument } from './modularity-guard-policy.mjs';

test('semantic governance path inventory is exact', () => {
  const governed = [
    'AGENTS.md',
    'docs/plans/current-program.md',
    'docs/plans/current-tracker.md',
    'docs/plans/history/2026-09-22-current-program-ledger.md',
    'docs/plans/history/2026-09-22-current-tracker-ledger.md',
  ];
  assert.equal(governed.every(isSemanticGovernanceDocument), true);
  assert.equal(isSemanticGovernanceDocument('docs/plans/other.md'), false);
});
