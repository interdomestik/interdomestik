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
import { normalizeManifestIdentity } from './slice-rehearse-manifest-identity.mjs';

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
    ['docs/plans/current-program.md', 'docs/plans/current-tracker.md', 'scripts/owner-helper.mjs']
  );
  assert.deepEqual(projectionCapacityOwnerPaths(protectedBudget, { topology: {} }), [
    'docs/plans/current-program.md',
    'docs/plans/current-tracker.md',
  ]);
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
  assert.equal(canonicalModularityForPath('scripts/new-module.mjs').maxLines, 300);
  assert.equal(canonicalModularityForPath('scripts/legacy-module.mjs').maxLines, 300);
});

test('legacy staff claim test keeps its exact non-growing rehearsal ceiling', () => {
  const path = 'packages/domain-claims/src/staff-claims/update-status.test.ts';
  assert.deepEqual(canonicalModularityForPath(path), {
    fileClass: 'focused-test',
    maxLines: 804,
    maxBytes: 29315,
  });
  const manifest = {
    pathPlans: [{ path, change: 'modify', maxBytesDelta: 0, maxLines: 804 }],
  };
  const repository = {
    writerFacts: {
      [path]: {
        manifestBaseSha256: '2c9782b2d1ee5501049c2c59c309448c687f477eec4a88e8e19856675dafc627',
      },
    },
    writerLineCounts: { [path]: 803 },
    writerDeltas: {
      [path]: {
        bytes: -1,
        baseBytes: 29315,
        currentBytes: 29314,
        manifestBaseExists: true,
      },
    },
  };
  const budget = { maxLargestFileBytes: 40000, maxSourceOrTestLines: 1000 };
  assert.deepEqual(evaluateWriterPolicy(manifest, repository, budget), {
    authorityStops: [],
    deficits: [],
  });

  repository.writerLineCounts[path] = 805;
  assert.ok(evaluateWriterPolicy(manifest, repository, budget).deficits.length > 0);
  repository.writerLineCounts[path] = 803;
  repository.writerDeltas[path].currentBytes = 29316;
  assert.ok(evaluateWriterPolicy(manifest, repository, budget).deficits.length > 0);
  repository.writerDeltas[path].currentBytes = 29314;
  repository.writerFacts[path].manifestBaseSha256 = 'f'.repeat(64);
  assert.ok(evaluateWriterPolicy(manifest, repository, budget).authorityStops.length > 0);
  manifest.pathPlans[0].maxLines = 300;
  repository.writerLineCounts[path] = 300;
  assert.ok(evaluateWriterPolicy(manifest, repository, budget).authorityStops.length > 0);
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

test('governance manifests default-deny product and successor capacity owners', () => {
  assert.deepEqual(
    normalizeManifestIdentity(
      {
        schemaVersion: 2,
        tier: 3,
        baseSha: 'a'.repeat(40),
        origin: 'https://github.com/interdomestik/interdomestik.git',
        workClass: 'governance',
        capacityOwnerId: 'harness-v2-efficiency',
      },
      'HARNESS-V2-1'
    ).versionFields,
    { capacityOwnerId: 'harness-v2-efficiency', workClass: 'governance' }
  );
  for (const capacityOwnerId of ['t117b-cutover', 't117c-provider', 't118-promotion']) {
    assert.throws(
      () =>
        normalizeManifestIdentity(
          {
            schemaVersion: 2,
            tier: 3,
            baseSha: 'a'.repeat(40),
            origin: 'https://github.com/interdomestik/interdomestik.git',
            workClass: 'governance',
            capacityOwnerId,
          },
          'HARNESS-V2-1'
        ),
      /explicit governance allocation/u
    );
  }
});
