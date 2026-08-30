import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import { deriveCapacityProposal } from './slice-rehearse-capacity.mjs';
import { evaluateRehearsal } from './slice-rehearse-evaluator.mjs';

const budgetBytes = readFileSync(new URL('./repo-size-budget.json', import.meta.url));
const budget = JSON.parse(budgetBytes);
const budgetText = budgetBytes.toString('utf8');
const sha = value => value.repeat(40);
const baselineBudgetBytes =
  budgetBytes.byteLength - budget.allocations[0].pathBytesDelta['scripts/repo-size-budget.json'];
const projectionPaths = ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'];
const T117B_PRODUCT_MAIN = '124ec51cefd022dd7103a4f958cb9ebef5427dad';
const hasStop = (proposal, code) => proposal.authorityStops.some(item => item.code === code);
function closeoutManifest(overrides = {}) {
  const writerPaths = overrides.writerPaths ?? projectionPaths;
  const pathPlans =
    overrides.pathPlans ??
    writerPaths.map(path => ({
      path,
      change: path.startsWith('docs/plans/current-') ? 'modify' : 'create',
      category:
        path === 'docs/plans/current-tracker.md'
          ? 'large support/generated-ish'
          : path.endsWith('.md')
            ? 'docs/text'
            : 'source/scripts',
      maxBytesDelta: path === 'docs/plans/current-tracker.md' ? 500 : 1_000,
      maxLines: 200,
    }));
  return validateRehearsalManifest({
    schemaVersion: 1,
    sliceId: 'T117B-DATA',
    tier: 3,
    baseSha: T117B_PRODUCT_MAIN,
    origin: 'https://github.com/interdomestik/interdomestik.git',
    writerPaths,
    pathPlans,
    routineOperations: overrides.routineOperations ?? [],
    proof: {
      commands: ['pnpm plan:status'],
      heavyLanes: [],
      fullGateRequired: false,
      workflowDigest: sha256('closeout-workflow'),
      substrateDigest: sha256('closeout-substrate'),
    },
    evidenceReceipts: [],
    topology: {
      closeoutMode: 'projection-only',
      projectionPaths,
      repairAllocationId: overrides.repairAllocationId ?? null,
      repairPaths: overrides.repairPaths ?? [],
    },
  });
}
function repository(manifest, tracked = {}) {
  const value = {
    root: '/repo',
    origin: manifest.origin,
    headSha: manifest.baseSha,
    treeSha: sha('b'),
    baseSha: manifest.baseSha,
    capacityBaseSha: manifest.baseSha,
    protectedMainSha: manifest.baseSha,
    mergeBaseSha: manifest.baseSha,
    baseIsAncestor: true,
    branch: 'codex/t117b-data-closeout',
    committedChangedPaths: [...manifest.writerPaths],
    protectedMainAdvancedPaths: [],
    dirtyPaths: [...manifest.writerPaths],
    tracked: {
      files: tracked.files ?? budget.maxTrackedFiles,
      bytes: tracked.bytes ?? budget.maxTrackedBytes - 5_000,
      categoryBytes:
        tracked.categoryBytes ??
        Object.fromEntries(
          Object.entries(budget.maxCategoryBytes).map(([category, bytes]) => [
            category,
            bytes - 5_000,
          ])
        ),
    },
    writerLineCounts: Object.fromEntries(manifest.writerPaths.map(path => [path, 50])),
    writerDeltas: Object.fromEntries(
      manifest.writerPaths.map(path => [
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
    ),
  };
  const owner = budget.allocations.find(allocation => allocation.id === 't116-case-summary');
  value.capacityOwnerDeltas = Object.fromEntries(
    owner.writerPaths.map(path => {
      if (value.writerDeltas[path]) return [path, { ...value.writerDeltas[path] }];
      const bytes = owner.maxPathBytesDelta[path] - 1_000;
      return [
        path,
        {
          bytes,
          currentBytes: bytes,
          currentSha256: sha256(path),
          files: 1,
          capacityBaselineExists: false,
          currentExists: true,
        },
      ];
    })
  );
  return value;
}
const json = value => (value === budget ? budgetText : `${JSON.stringify(value, null, 2)}\n`);
function capacity(manifest, facts, worktree = budget, protectedValue = worktree) {
  return deriveCapacityProposal({
    budget: worktree,
    budgetText: json(worktree),
    protectedBudget: protectedValue,
    protectedBudgetText: json(protectedValue),
    manifest,
    baselineBudgetBytes,
    writerDeltas: facts.writerDeltas,
    capacityOwnerDeltas: facts.capacityOwnerDeltas,
  });
}
function rehearse(manifest, facts, worktree = budget, protectedValue = worktree) {
  return evaluateRehearsal({
    manifest,
    repository: facts,
    budget: worktree,
    budgetText: json(worktree),
    protectedBudget: protectedValue,
    protectedBudgetText: json(protectedValue),
    baselineBudgetBytes,
  });
}
test('rehearses a real T117B-DATA projection closeout without capacity mutation', () => {
  const manifest = closeoutManifest();
  const facts = repository(manifest);
  const proposal = capacity(manifest, facts);
  assert.deepEqual(proposal.budget, budget);
  assert.equal(proposal.allocation.id, 't117b-data-projection');
  assert.equal(proposal.allocation.mode, 'projection-existing');
  assert.deepEqual(proposal.allocation.writerPaths, projectionPaths);
  assert.deepEqual(Object.keys(proposal.projectionPathCaps), projectionPaths);
  const report = rehearse(manifest, facts);
  assert.deepEqual(report.authorityStops, []);
  assert.deepEqual(
    report.operationalEnvelope.capacity.projectionPathCaps,
    proposal.projectionPathCaps
  );
  assert.deepEqual(report.capacity.budgetArtifact, {
    content: budgetBytes.toString('utf8'),
    sha256: sha256(budgetBytes),
    utf8Bytes: budgetBytes.byteLength,
  });
  const plannedFacts = repository(manifest, { bytes: budget.maxTrackedBytes });
  plannedFacts.writerDeltas['docs/plans/current-program.md'].bytes = 0;
  plannedFacts.writerDeltas['docs/plans/current-tracker.md'].bytes = 0;
  const overCapacity = rehearse(manifest, plannedFacts);
  assert.ok(hasStop(overCapacity, 'capacity:global-tracked-bytes'));
  assert.equal(overCapacity.operationalEnvelope, null);
});
test('real mixed closeout derives one distinct prerequisite repair allocation', () => {
  const repairPaths = [
    'scripts/repo-size-budget.json',
    'scripts/t117b-closeout-repair.mjs',
    'scripts/t117b-closeout-repair.test.mjs',
  ];
  const base = closeoutManifest();
  const manifest = closeoutManifest({
    writerPaths: [...projectionPaths, ...repairPaths].sort(),
    repairAllocationId: 't117b-data-closeout-repair',
    repairPaths,
    routineOperations: ['derived_capacity_rebind', 'sequence_prerequisite_before_projection'],
    pathPlans: [
      ...base.pathPlans,
      {
        path: repairPaths[0],
        change: 'modify',
        category: 'config/data/messages',
        maxBytesDelta: 0,
        maxLines: 1_000,
      },
      {
        path: repairPaths[1],
        change: 'create',
        category: 'source/scripts',
        maxBytesDelta: 800,
        maxLines: 200,
      },
      {
        path: repairPaths[2],
        change: 'create',
        category: 'tests/e2e',
        maxBytesDelta: 1_000,
        maxLines: 300,
      },
    ],
  });
  const facts = repository(manifest);
  for (const path of repairPaths.slice(1)) {
    facts.writerDeltas[path] = {
      bytes: 0,
      currentBytes: 0,
      currentSha256: null,
      files: 1,
      capacityBaselineExists: false,
      manifestBaseExists: false,
      currentExists: false,
    };
  }
  const proposal = capacity(manifest, facts);
  assert.equal(proposal.mode, 'derived');
  assert.equal(proposal.allocation.id, 't117b-data-closeout-repair');
  assert.deepEqual(proposal.allocation.writerPaths, repairPaths.slice(1));
  assert.deepEqual(proposal.authorityStops, []);
  assert.deepEqual(
    proposal.budget.allocations.find(item => item.id === 't117b-portal-runtime-history'),
    budget.allocations.find(item => item.id === 't117b-portal-runtime-history')
  );
  assert.deepEqual(proposal.budget.reserve, budget.reserve);
  const report = rehearse(manifest, facts);
  const topologyDeficit = report.deficits.find(
    item => item.code === 'topology:repair-before-closeout'
  );
  assert.equal(topologyDeficit.coveredBy, 'sequence_prerequisite_before_projection');
  assert.deepEqual(topologyDeficit.paths, repairPaths);
  assert.ok(report.operationalEnvelope);
  assert.ok(
    !report.operationalEnvelope.routineOperations.includes('bounded_force_with_lease_rebuild')
  );
});
test('projection exemption fails closed on missing ownership or path headroom', () => {
  const manifest = closeoutManifest();
  const facts = repository(manifest);
  facts.writerDeltas['docs/plans/current-program.md'].bytes = 4_273;
  const overCap = capacity(manifest, facts);
  assert.ok(hasStop(overCap, 'capacity:projection-current-path-insufficient'));
  const ownerlessBudget = structuredClone(budget);
  const owner = ownerlessBudget.allocations.find(item => item.id === 't116-case-summary');
  owner.writerPaths = owner.writerPaths.filter(path => path !== 'docs/plans/current-program.md');
  delete owner.maxPathBytesDelta['docs/plans/current-program.md'];
  const ownerless = capacity(manifest, facts, ownerlessBudget);
  assert.ok(hasStop(ownerless, 'capacity:projection-writer-unowned'));
});
test('projection reuse checks grouped owner byte and category headroom', () => {
  const manifest = closeoutManifest();
  const facts = repository(manifest);
  facts.writerDeltas['docs/plans/current-program.md'].bytes = 0;
  facts.writerDeltas['docs/plans/current-tracker.md'].bytes = 0;
  const constrainedBudget = structuredClone(budget);
  const owner = constrainedBudget.allocations.find(item => item.id === 't116-case-summary');
  const categories = {
    'config/data/messages': 0,
    'docs/text': 100,
    'large support/generated-ish': 50,
    'source/scripts': 0,
    'tests/e2e': 0,
  };
  constrainedBudget.maxTrackedBytes += 150 - owner.maxTrackedBytesDelta;
  for (const [category, previous] of Object.entries(owner.maxCategoryBytesDelta)) {
    constrainedBudget.maxCategoryBytes[category] += (categories[category] ?? 0) - previous;
  }
  owner.maxTrackedBytesDelta = 150;
  owner.maxCategoryBytesDelta = categories;
  const proposal = capacity(manifest, facts, constrainedBudget);
  assert.ok(hasStop(proposal, 'capacity:projection-owner-tracked-bytes-insufficient'));
  assert.ok(hasStop(proposal, 'capacity:projection-owner-category-insufficient'));
  const createPlan = closeoutManifest({
    pathPlans: manifest.pathPlans.map(plan =>
      plan.path === 'docs/plans/current-program.md' ? { ...plan, change: 'create' } : plan
    ),
  });
  const fileProposal = capacity(createPlan, repository(createPlan));
  assert.ok(hasStop(fileProposal, 'capacity:projection-owner-tracked-files-insufficient'));
});
