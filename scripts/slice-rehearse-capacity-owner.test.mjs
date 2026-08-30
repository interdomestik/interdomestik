import assert from 'node:assert/strict';
import test from 'node:test';

import {
  capacityOwnerDeltasFromFacts,
  projectionCapacityOwnerPaths,
} from './slice-rehearse-capacity-owner-facts.mjs';
import {
  canonicalModularityForPath,
  evaluateWriterPolicy,
} from './slice-rehearse-writer-policy.mjs';

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

test('production modules use the canonical executable review boundary', () => {
  assert.equal(canonicalModularityForPath('scripts/new-module.mjs', 'create').maxLines, 300);
  assert.equal(canonicalModularityForPath('scripts/legacy-module.mjs', 'modify').maxLines, 300);
});

test('planned bytes use the exact baseline and enforce final governance byte caps', () => {
  const sourcePolicy = evaluateWriterPolicy(
    {
      pathPlans: [
        { path: 'scripts/worker.mjs', change: 'modify', maxBytesDelta: 800, maxLines: 200 },
      ],
    },
    {
      writerLineCounts: { 'scripts/worker.mjs': 100 },
      writerDeltas: {
        'scripts/worker.mjs': {
          bytes: 500,
          baseBytes: 1_000,
          currentBytes: 1_500,
          manifestBaseExists: true,
        },
      },
    },
    { maxLargestFileBytes: 1_900, maxSourceOrTestLines: 300 }
  );
  assert.ok(!sourcePolicy.authorityStops.some(item => item.code.includes('scripts/worker.mjs')));
  const governancePolicy = evaluateWriterPolicy(
    {
      pathPlans: [
        { path: 'docs/worker.md', change: 'modify', maxBytesDelta: 40_000, maxLines: 200 },
      ],
    },
    {
      writerLineCounts: { 'docs/worker.md': 100 },
      writerDeltas: {
        'docs/worker.md': {
          bytes: 0,
          baseBytes: 100_000,
          currentBytes: 100_000,
          manifestBaseExists: true,
        },
      },
    },
    { maxLargestFileBytes: 200_000, maxSourceOrTestLines: 300 }
  );
  assert.ok(governancePolicy.deficits.some(item => item.code.includes('docs/worker.md')));
});
