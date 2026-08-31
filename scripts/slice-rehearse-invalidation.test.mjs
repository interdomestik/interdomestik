import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalJson, sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import { deriveEvidenceIdentityKey } from './slice-rehearse-evidence.mjs';
import {
  evidenceAfterPlannedOperations,
  evaluateRehearsal,
  requiredFullGateDeficit,
  requiredEvidenceProofDeficit,
} from './slice-rehearse-evaluator.mjs';
import { budgetCategory } from './repo-size-budget-sync-core.mjs';

const budgetBytes = readFileSync(new URL('./repo-size-budget.json', import.meta.url));
const budget = JSON.parse(budgetBytes);
const allocation = budget.allocations.find(item => item.id === 'harness-v2-efficiency');
const sha = character => character.repeat(40);

test('full evaluation invalidates reusable proof for a pending identity-changing operation', () => {
  const writerPaths = [...allocation.writerPaths].sort();
  const proof = {
    commands: ['node --test scripts/slice-rehearse-invalidation.test.mjs'],
    heavyLanes: ['pr-e2e'],
    fullGateRequired: false,
    workflowDigest: sha256('workflow'),
    substrateDigest: sha256('substrate'),
  };
  const manifest = validateRehearsalManifest({
    schemaVersion: 1,
    sliceId: 'HARNESS-V2-EFFICIENCY',
    tier: 3,
    baseSha: sha('a'),
    origin: 'https://github.com/interdomestik/interdomestik.git',
    writerPaths,
    pathPlans: writerPaths.map(path => ({
      path,
      change: ['.github/workflows/ci.yml', 'package.json'].includes(path) ? 'modify' : 'create',
      category: budgetCategory(path),
      maxBytesDelta: allocation.maxPathBytesDelta[path],
      maxLines: path.endsWith('.test.mjs') ? 300 : path.endsWith('.md') ? 1000 : 200,
    })),
    routineOperations: ['fresh_worktree_patch_replay', 'rerun_invalidated_proof'],
    proof,
    evidenceReceipts: [],
    topology: {
      closeoutMode: 'none',
      projectionPaths: [],
      repairAllocationId: null,
      repairPaths: [],
    },
  });
  const writerMapDigest = sha256(canonicalJson(writerPaths));
  const identity = {
    lane: 'pr-e2e',
    headSha: sha('a'),
    treeSha: sha('b'),
    commandDigest: sha256(canonicalJson(proof.commands)),
    workflowDigest: proof.workflowDigest,
    substrateDigest: proof.substrateDigest,
    writerMapDigest,
  };
  manifest.evidenceReceipts = [
    { ...identity, status: 'success', expiresAt: '2099-01-01T00:00:00.000Z' },
  ];
  const writerDeltas = Object.fromEntries(
    writerPaths.map(path => [
      path,
      {
        bytes: 0,
        currentBytes: 1,
        currentSha256: sha256(path),
        files: 0,
        capacityBaselineExists: true,
        manifestBaseExists: ['.github/workflows/ci.yml', 'package.json'].includes(path),
        currentExists: true,
      },
    ])
  );
  const report = evaluateRehearsal({
    manifest,
    repository: {
      root: '/repo',
      origin: manifest.origin,
      headSha: sha('a'),
      treeSha: sha('b'),
      baseSha: sha('a'),
      capacityBaseSha: sha('a'),
      protectedMainSha: sha('a'),
      mergeBaseSha: sha('a'),
      baseIsAncestor: true,
      branch: 'codex/harness-v2',
      committedChangedPaths: [],
      protectedMainAdvancedPaths: ['README.md'],
      dirtyPaths: [],
      tracked: {
        files: budget.maxTrackedFiles - 1,
        bytes: budget.maxTrackedBytes - 1,
        categoryBytes: Object.fromEntries(
          Object.entries(budget.maxCategoryBytes).map(([key, value]) => [key, value - 1])
        ),
      },
      writerLineCounts: Object.fromEntries(writerPaths.map(path => [path, 1])),
      writerDeltas,
      verifiedEvidenceKeysByLane: {
        'pr-e2e': [
          {
            provider: 'github',
            key: deriveEvidenceIdentityKey(identity),
            checkId: 1,
            runId: 2,
            completedAt: new Date().toISOString(),
          },
        ],
      },
    },
    budget,
    budgetText: canonicalJson(budget),
    protectedBudget: budget,
    protectedBudgetText: canonicalJson(budget),
    baselineBudgetBytes:
      budgetBytes.byteLength -
      budget.allocations[0].pathBytesDelta['scripts/repo-size-budget.json'],
  });
  assert.deepEqual(report.evidence.reusableLanes, []);
  assert.deepEqual(report.evidence.missingLanes, ['pr-e2e']);
  assert.equal(report.evidence.decisions[0].reusable, false);
  assert.equal(report.evidence.decisions[0].reason, 'invalidated_by_planned_operation');
  assert.ok(report.deficits.some(item => item.code === 'evidence:heavy-proof-required'));
});

test('only still-pending deficit operations invalidate current reusable proof', () => {
  const current = {
    decisions: [{ lane: 'pr-e2e', reusable: true }],
    reusableLanes: ['pr-e2e'],
    missingLanes: [],
  };
  const final = evidenceAfterPlannedOperations(current, [
    { code: 'capacity:new-files', coveredBy: 'derived_capacity_rebind' },
  ]);
  assert.deepEqual(final.reusableLanes, []);
  assert.deepEqual(final.missingLanes, ['pr-e2e']);
  assert.equal(final.decisions[0].reusable, false);
  assert.equal(final.decisions[0].reason, 'invalidated_by_planned_operation');
  assert.deepEqual(requiredEvidenceProofDeficit(final), {
    code: 'evidence:heavy-proof-required',
    lanes: ['pr-e2e'],
    coveredBy: 'rerun_invalidated_proof',
  });

  const explicitlyPlanned = evidenceAfterPlannedOperations(current, []);
  assert.deepEqual(explicitlyPlanned.missingLanes, []);

  const prerequisite = evidenceAfterPlannedOperations(current, [
    {
      code: 'topology:repair-before-closeout',
      coveredBy: 'sequence_prerequisite_before_projection',
    },
  ]);
  assert.deepEqual(prerequisite.missingLanes, ['pr-e2e']);
});

test('identity-preserving full-gate admission does not invalidate exact-head proof', () => {
  const current = {
    decisions: [{ lane: 'pr-e2e', reusable: true }],
    reusableLanes: ['pr-e2e'],
    missingLanes: [],
  };
  const final = evidenceAfterPlannedOperations(current, [
    { code: 'proof:full-gate', coveredBy: 'apply_full_gate_label' },
  ]);
  assert.deepEqual(final.missingLanes, []);
  assert.equal(requiredEvidenceProofDeficit(final), null);
});

test('ready-state synchronize requires one-shot exact-head full-gate admission', () => {
  assert.deepEqual(requiredFullGateDeficit(true, ['docs/example.md']), {
    code: 'proof:full-gate',
    coveredBy: 'apply_full_gate_label',
  });
  assert.equal(requiredFullGateDeficit(true, ['.github/workflows/ci.yml']), null);
  assert.equal(requiredFullGateDeficit(false, ['docs/example.md']), null);
});
