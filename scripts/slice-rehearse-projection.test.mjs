import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { budgetCategory } from './repo-size-budget-sync-core.mjs';
import { sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import { deriveCapacityProposal } from './slice-rehearse-capacity.mjs';
import { evaluateRehearsal } from './slice-rehearse-evaluator.mjs';

const bytes = readFileSync(new URL('./repo-size-budget.json', import.meta.url));
const budget = JSON.parse(bytes);
const budgetText = bytes.toString('utf8');
const categoryHeadroom = Object.fromEntries(
  Object.entries(budget.maxCategoryBytes).map(([category, value]) => [category, value - 5_000])
);
const sha = value => value.repeat(40);
const baseline =
  bytes.byteLength - budget.allocations[0].pathBytesDelta['scripts/repo-size-budget.json'];
const CLOSEOUT = ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'];
const [PROGRAM, TRACKER] = CLOSEOUT;
const PROMOTION = [
  'docs/plans/2026-08-28-t117b-cutover-admission.json',
  'docs/plans/2026-08-28-t117b-cutover-design-gate.md',
  ...CLOSEOUT,
];
const BASE = '124ec51cefd022dd7103a4f958cb9ebef5427dad';
const PROJ = 't116-case-summary';
const CUTOVER = 't117b-cutover';
const BASELINE_NEW = { currentBytes: 100, files: 1, capacityBaselineExists: false };
const hasStop = (value, code) => value.authorityStops.some(item => item.code === code);
const allocation = (id, value = budget) => value.allocations.find(item => item.id === id);
const plan = (path, overrides = {}) => ({
  path,
  change: path.startsWith('docs/plans/current-') ? 'modify' : 'create',
  category: budgetCategory(path),
  maxBytesDelta: path === TRACKER ? 500 : 1_000,
  maxLines: 200,
  ...overrides,
});
const fact = (path, overrides = {}) => ({
  bytes: 100,
  currentBytes: 1_000,
  currentSha256: sha256(path),
  files: 0,
  capacityBaselineExists: true,
  manifestBaseExists: true,
  currentExists: true,
  ...overrides,
});
function manifest(overrides = {}) {
  const writerPaths = overrides.writerPaths ?? CLOSEOUT;
  const pathPlans = overrides.pathPlans ?? writerPaths.map(path => plan(path));
  return validateRehearsalManifest({
    schemaVersion: 1,
    sliceId: 'T117B-DATA',
    tier: 3,
    baseSha: BASE,
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
      projectionPaths: CLOSEOUT,
      repairAllocationId: overrides.repairAllocationId ?? null,
      repairPaths: overrides.repairPaths ?? [],
    },
  });
}
function promotion() {
  return validateRehearsalManifest({
    ...manifest(),
    schemaVersion: 2,
    sliceId: 'T117B-CUTOVER',
    capacityOwnerId: CUTOVER,
    workClass: 'governance',
    writerPaths: PROMOTION,
    pathPlans: PROMOTION.map(path => plan(path, { change: 'modify', maxBytesDelta: 100 })),
    topology: {
      closeoutMode: 'promotion',
      projectionPaths: PROMOTION,
      repairAllocationId: null,
      repairPaths: [],
    },
  });
}
function repo(manifest, tracked = {}, ids = [PROJ], capBudget = budget) {
  const { baseSha, origin, writerPaths: paths } = manifest;
  const promoting = manifest.topology.closeoutMode === 'promotion';
  const writerFact = path =>
    fact(path, promoting && !path.includes('current-') ? BASELINE_NEW : {});
  const value = {
    root: '/repo',
    origin,
    headSha: baseSha,
    treeSha: sha('b'),
    baseSha,
    capacityBaseSha: baseSha,
    protectedMainSha: baseSha,
    mergeBaseSha: baseSha,
    baseIsAncestor: true,
    branch: 'codex/t117b-data-closeout',
    committedChangedPaths: paths,
    protectedMainAdvancedPaths: [],
    dirtyPaths: paths,
    tracked: {
      files: tracked.files ?? budget.maxTrackedFiles,
      bytes: tracked.bytes ?? budget.maxTrackedBytes - 5_000,
      categoryBytes: tracked.categoryBytes ?? categoryHeadroom,
    },
    writerLineCounts: Object.fromEntries(paths.map(path => [path, 50])),
    writerDeltas: Object.fromEntries(paths.map(path => [path, writerFact(path)])),
  };
  const ownerFact = (owner, path) => {
    if (value.writerDeltas[path]) return { ...value.writerDeltas[path] };
    const bytes = promoting ? 0 : owner.maxPathBytesDelta[path] - 1_000;
    return fact(path, {
      bytes,
      currentBytes: promoting ? 1_000 : bytes,
      files: Number(!promoting),
      capacityBaselineExists: promoting,
    });
  };
  value.capacityOwnerDeltas = Object.fromEntries(
    ids.flatMap(ownerId => {
      const owner = allocation(ownerId, capBudget);
      return owner.writerPaths.map(path => [path, ownerFact(owner, path)]);
    })
  );
  return value;
}
const json = value => (value === budget ? budgetText : `${JSON.stringify(value, null, 2)}\n`);
const inputs = (manifest, worktree, guard) => ({
  manifest,
  budget: worktree,
  budgetText: json(worktree),
  protectedBudget: guard,
  protectedBudgetText: json(guard),
  baselineBudgetBytes: baseline,
});
const capacity = (manifest, facts, worktree = budget, guard = worktree) =>
  deriveCapacityProposal({
    ...inputs(manifest, worktree, guard),
    writerDeltas: facts.writerDeltas,
    capacityOwnerDeltas: facts.capacityOwnerDeltas,
  });
const rehearse = (manifest, facts, worktree = budget, guard = worktree) =>
  evaluateRehearsal({ ...inputs(manifest, worktree, guard), repository: facts });
test('projection keeps the budget unchanged', () => {
  const value = manifest();
  const facts = repo(value);
  const proposal = capacity(value, facts);
  assert.deepEqual(proposal.budget, budget);
  assert.deepEqual(
    [proposal.allocation.id, proposal.allocation.mode],
    ['t117b-data-projection', 'projection-existing']
  );
  assert.deepEqual(Object.keys(proposal.projectionPathCaps), CLOSEOUT);
  const report = rehearse(value, facts);
  assert.deepEqual(report.authorityStops, []);
  const plannedFacts = repo(value, { bytes: budget.maxTrackedBytes });
  plannedFacts.writerDeltas[PROGRAM].bytes = 0;
  plannedFacts.writerDeltas[TRACKER].bytes = 0;
  const overCapacity = rehearse(value, plannedFacts);
  assert.ok(hasStop(overCapacity, 'capacity:global-tracked-bytes'));
  assert.equal(overCapacity.operationalEnvelope, null);
});
test('promotion reuses baseline-new writers only within the owner file ceiling', () => {
  const value = promotion();
  const facts = repo(value, {}, [PROJ, CUTOVER]);
  const proposal = capacity(value, facts);
  assert.deepEqual(proposal.authorityStops, []);
  assert.deepEqual(proposal.budget, budget);
  for (const path of PROMOTION)
    assert.equal(proposal.projectionOwners[path], path.includes('current-') ? PROJ : CUTOVER);
  const guard = structuredClone(budget);
  allocation(CUTOVER, guard).maxTrackedFilesDelta = 1;
  guard.maxTrackedFiles -= 2;
  const insufficient = capacity(value, facts, guard);
  assert.ok(hasStop(insufficient, 'capacity:projection-owner-tracked-files-insufficient'));
});
test('mixed closeout derives one repair allocation', () => {
  const repairPaths = [
    'scripts/repo-size-budget.json',
    'scripts/t117b-closeout-repair.mjs',
    'scripts/t117b-closeout-repair.test.mjs',
  ];
  const base = manifest();
  const value = manifest({
    writerPaths: [...CLOSEOUT, ...repairPaths].sort(),
    repairAllocationId: 't117b-data-closeout-repair',
    repairPaths,
    routineOperations: ['derived_capacity_rebind', 'sequence_prerequisite_before_projection'],
    pathPlans: [
      ...base.pathPlans,
      plan(repairPaths[0], { change: 'modify', maxBytesDelta: 0, maxLines: 1_000 }),
      plan(repairPaths[1], { maxBytesDelta: 800 }),
      plan(repairPaths[2], { maxLines: 300 }),
    ],
  });
  const facts = repo(value);
  for (const path of repairPaths.slice(1)) {
    facts.writerDeltas[path] = fact(path, {
      bytes: 0,
      currentBytes: 0,
      currentSha256: null,
      files: 1,
      capacityBaselineExists: false,
      manifestBaseExists: false,
      currentExists: false,
    });
  }
  const proposal = capacity(value, facts);
  assert.deepEqual(
    [proposal.mode, proposal.allocation.id],
    ['derived', 't117b-data-closeout-repair']
  );
  assert.deepEqual(proposal.allocation.writerPaths, repairPaths.slice(1));
  assert.deepEqual(proposal.authorityStops, []);
  assert.deepEqual(proposal.budget.reserve, budget.reserve);
  const report = rehearse(value, facts);
  const deficit = report.deficits.find(item => item.code === 'topology:repair-before-closeout');
  assert.equal(deficit.coveredBy, 'sequence_prerequisite_before_projection');
  assert.deepEqual(deficit.paths, repairPaths);
  assert.ok(report.operationalEnvelope);
  assert.ok(
    !report.operationalEnvelope.routineOperations.includes('bounded_force_with_lease_rebuild')
  );
});
test('projection fails without ownership or headroom', () => {
  const value = manifest();
  const facts = repo(value);
  facts.writerDeltas[PROGRAM].bytes = 4_273;
  const overCap = capacity(value, facts);
  assert.ok(hasStop(overCap, 'capacity:projection-current-path-insufficient'));
  const ownerlessBudget = structuredClone(budget);
  const owner = allocation(PROJ, ownerlessBudget);
  owner.writerPaths = owner.writerPaths.filter(path => path !== PROGRAM);
  delete owner.maxPathBytesDelta[PROGRAM];
  const ownerless = capacity(value, facts, ownerlessBudget);
  assert.ok(hasStop(ownerless, 'capacity:projection-writer-unowned'));
});
test('projection checks grouped owner headroom', () => {
  const value = manifest();
  const facts = repo(value);
  facts.writerDeltas[PROGRAM].bytes = 0;
  facts.writerDeltas[TRACKER].bytes = 0;
  const guard = structuredClone(budget);
  const owner = allocation(PROJ, guard);
  const categories = {
    'config/data/messages': 0,
    'docs/text': 100,
    'large support/generated-ish': 50,
    'source/scripts': 0,
    'tests/e2e': 0,
  };
  guard.maxTrackedBytes += 150 - owner.maxTrackedBytesDelta;
  for (const [category, previous] of Object.entries(owner.maxCategoryBytesDelta)) {
    guard.maxCategoryBytes[category] += (categories[category] ?? 0) - previous;
  }
  owner.maxTrackedBytesDelta = 150;
  owner.maxCategoryBytesDelta = categories;
  const proposal = capacity(value, facts, guard);
  assert.ok(hasStop(proposal, 'capacity:projection-owner-tracked-bytes-insufficient'));
  assert.ok(hasStop(proposal, 'capacity:projection-owner-category-insufficient'));
  const createPlan = manifest({
    pathPlans: value.pathPlans.map(item =>
      item.path === PROGRAM ? { ...item, change: 'create' } : item
    ),
  });
  const fileProposal = capacity(createPlan, repo(createPlan));
  assert.ok(hasStop(fileProposal, 'capacity:projection-owner-tracked-files-insufficient'));
});
