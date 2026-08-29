import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import { deriveCapacityProposal } from './slice-rehearse-capacity.mjs';
import { evaluateRehearsal } from './slice-rehearse-evaluator.mjs';

const bytes = readFileSync(new URL('./repo-size-budget.json', import.meta.url));
const budget = JSON.parse(bytes);
const text = value =>
  value === budget ? bytes.toString('utf8') : `${JSON.stringify(value, null, 2)}\n`;
const baselineBytes =
  bytes.byteLength - budget.allocations[0].pathBytesDelta['scripts/repo-size-budget.json'];
const sha = value => value.repeat(40);
const paths = ['scripts/rehearse-repair.mjs', 'scripts/rehearse-repair.test.mjs'];

function manifest(maxima = [800, 1_000]) {
  return validateRehearsalManifest({
    schemaVersion: 1,
    sliceId: 'REHEARSE-REPAIR',
    tier: 3,
    baseSha: sha('a'),
    origin: 'https://github.com/interdomestik/interdomestik.git',
    writerPaths: ['scripts/repo-size-budget.json', ...paths].sort(),
    pathPlans: [
      {
        path: 'scripts/repo-size-budget.json',
        change: 'modify',
        category: 'config/data/messages',
        maxBytesDelta: 0,
        maxLines: 1_000,
      },
      {
        path: paths[0],
        change: 'create',
        category: 'source/scripts',
        maxBytesDelta: maxima[0],
        maxLines: 200,
      },
      {
        path: paths[1],
        change: 'create',
        category: 'tests/e2e',
        maxBytesDelta: maxima[1],
        maxLines: 300,
      },
    ],
    routineOperations: ['derived_capacity_rebind'],
    proof: {
      commands: ['node --test scripts/rehearse-repair.test.mjs'],
      heavyLanes: [],
      fullGateRequired: false,
      workflowDigest: sha256('workflow'),
      substrateDigest: sha256('substrate'),
    },
    evidenceReceipts: [],
    topology: {
      closeoutMode: 'none',
      projectionPaths: [],
      repairAllocationId: null,
      repairPaths: [],
    },
  });
}

function facts(value) {
  const writerDeltas = Object.fromEntries(
    value.writerPaths.map(path => [
      path,
      {
        bytes: 0,
        currentBytes: path === 'scripts/repo-size-budget.json' ? bytes.byteLength : 0,
        currentSha256: path === 'scripts/repo-size-budget.json' ? sha256(bytes) : null,
        files: path === 'scripts/repo-size-budget.json' ? 0 : 1,
        capacityBaselineExists: path === 'scripts/repo-size-budget.json',
        manifestBaseExists: path === 'scripts/repo-size-budget.json',
        currentExists: path === 'scripts/repo-size-budget.json',
      },
    ])
  );
  return writerDeltas;
}

function proposal(value, worktree = budget, protectedValue = budget) {
  return deriveCapacityProposal({
    budget: worktree,
    budgetText: text(worktree),
    protectedBudget: protectedValue,
    protectedBudgetText: text(protectedValue),
    manifest: value,
    baselineBudgetBytes: baselineBytes,
    writerDeltas: facts(value),
  });
}

test('prior derived candidate rebinds to a new candidate but rejects foreign allocation drift', () => {
  const first = proposal(manifest());
  assert.equal(Buffer.byteLength(first.budgetBytes) - baselineBytes, first.selfBytesDelta);
  const second = proposal(manifest([900, 1_100]), first.budget);
  assert.equal(second.mode, 'derived');
  assert.ok(second.deficits.some(item => item.code === 'capacity:worktree-budget-rebind'));
  assert.deepEqual(second.authorityStops, []);

  const foreign = structuredClone(first.budget);
  foreign.allocations.find(item => item.id === 't116-case-summary').maxPathBytesDelta[
    'docs/plans/current-program.md'
  ] += 1;
  const stopped = proposal(manifest([900, 1_100]), foreign);
  assert.ok(stopped.authorityStops.some(item => item.code === 'capacity:worktree-budget-drift'));
});

test('exact protected blob bytes and digest bind an unchanged projection proposal', () => {
  const projection = validateRehearsalManifest({
    ...manifest(),
    sliceId: 'T117B-DATA',
    writerPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
    pathPlans: [
      {
        path: 'docs/plans/current-program.md',
        change: 'modify',
        category: 'docs/text',
        maxBytesDelta: 500,
        maxLines: 200,
      },
      {
        path: 'docs/plans/current-tracker.md',
        change: 'modify',
        category: 'large support/generated-ish',
        maxBytesDelta: 500,
        maxLines: 200,
      },
    ],
    routineOperations: [],
    topology: {
      closeoutMode: 'projection-only',
      projectionPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
      repairAllocationId: null,
      repairPaths: [],
    },
  });
  const protectedText = `${bytes.toString('utf8').trimEnd()}  \n`;
  const deltas = Object.fromEntries(
    projection.writerPaths.map(path => [
      path,
      {
        bytes: 100,
        currentBytes: 1_000,
        currentSha256: sha256(path),
        files: 0,
        capacityBaselineExists: true,
        manifestBaseExists: true,
        currentExists: true,
      },
    ])
  );
  const owner = budget.allocations.find(item => item.id === 't116-case-summary');
  const capacityOwnerDeltas = Object.fromEntries(
    owner.writerPaths.map(path => {
      if (deltas[path]) return [path, deltas[path]];
      const deltaBytes = owner.maxPathBytesDelta[path] - 1_000;
      return [
        path,
        {
          bytes: deltaBytes,
          currentBytes: deltaBytes,
          currentSha256: sha256(path),
          files: 1,
          capacityBaselineExists: false,
          currentExists: true,
        },
      ];
    })
  );
  const result = deriveCapacityProposal({
    budget,
    budgetText: protectedText,
    protectedBudget: budget,
    protectedBudgetText: protectedText,
    manifest: projection,
    baselineBudgetBytes:
      Buffer.byteLength(protectedText) -
      budget.allocations[0].pathBytesDelta['scripts/repo-size-budget.json'],
    writerDeltas: deltas,
    capacityOwnerDeltas,
  });
  assert.equal(result.budgetBytes, protectedText);
  assert.equal(result.sha256, sha256(protectedText));
});

test('typed capacity stops aggregate with independent proof deficits', () => {
  const value = manifest();
  value.writerPaths = ['docs/plans/current-program.md'];
  value.pathPlans = [
    {
      path: value.writerPaths[0],
      change: 'modify',
      category: 'docs/text',
      maxBytesDelta: 2_000,
      maxLines: 200,
    },
  ];
  value.proof = { ...value.proof, heavyLanes: ['pr-e2e'], fullGateRequired: true };
  value.routineOperations = ['rerun_invalidated_proof'];
  const validated = validateRehearsalManifest(value);
  const deltas = facts(validated);
  const repository = {
    root: '/repo',
    origin: validated.origin,
    headSha: validated.baseSha,
    treeSha: sha('b'),
    baseSha: validated.baseSha,
    capacityBaseSha: validated.baseSha,
    protectedMainSha: validated.baseSha,
    mergeBaseSha: validated.baseSha,
    baseIsAncestor: true,
    branch: 'codex/rehearse-repair',
    committedChangedPaths: validated.writerPaths,
    protectedMainAdvancedPaths: [],
    dirtyPaths: validated.writerPaths,
    tracked: {
      files: budget.maxTrackedFiles,
      bytes: budget.maxTrackedBytes - 5_000,
      categoryBytes: budget.maxCategoryBytes,
    },
    writerLineCounts: { [validated.writerPaths[0]]: 50 },
    writerDeltas: deltas,
    capacityOwnerDeltas: {},
  };
  const report = evaluateRehearsal({
    manifest: validated,
    repository,
    budget,
    budgetText: text(budget),
    protectedBudget: budget,
    protectedBudgetText: text(budget),
    baselineBudgetBytes: baselineBytes,
  });
  assert.ok(report.authorityStops.some(item => item.code === 'capacity:writer-owner-overlap'));
  assert.ok(report.deficits.some(item => item.code === 'proof:full-gate'));
  assert.ok(report.deficits.some(item => item.code === 'evidence:heavy-proof-required'));
});
