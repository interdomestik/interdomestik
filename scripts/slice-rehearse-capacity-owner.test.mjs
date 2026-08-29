import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capacityOwnerDeltasFromFacts,
  projectionCapacityOwnerPaths,
} from './slice-rehearse-capacity-owner-facts.mjs';

test('projection capacity owner paths are the exact protected allocation writer union', () => {
  const protectedBudget = {
    allocations: [
      { writerPaths: ['docs/plans/current-program.md', 'scripts/owner-helper.mjs'] },
      { writerPaths: ['docs/plans/current-tracker.md', 'scripts/owner-helper.mjs'] },
      { writerPaths: ['successor.txt'] },
    ],
  };
  assert.deepEqual(
    projectionCapacityOwnerPaths(protectedBudget, {
      topology: {
        closeoutMode: 'projection-only',
        projectionPaths: ['docs/plans/current-program.md'],
      },
    }),
    ['docs/plans/current-program.md', 'scripts/owner-helper.mjs']
  );
});

test('capacity owner deltas preserve exact signed bytes and file deletion', () => {
  assert.deepEqual(
    capacityOwnerDeltasFromFacts({
      'deleted.txt': {
        baseBytes: 12,
        baseExists: true,
        currentBytes: 0,
        currentExists: false,
        currentSha256: null,
      },
    }),
    {
      'deleted.txt': {
        bytes: -12,
        capacityBaselineExists: true,
        currentBytes: 0,
        currentExists: false,
        currentSha256: null,
        files: -1,
      },
    }
  );
});
