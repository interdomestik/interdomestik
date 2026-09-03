import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import * as capacity from './slice-rehearse-capacity.mjs';
import { evaluateRehearsal } from './slice-rehearse-evaluator.mjs';
const bytes = readFileSync(new URL('./repo-size-budget.json', import.meta.url));
const budget = JSON.parse(bytes);
const BUDGET = 'scripts/repo-size-budget.json';
const extend = capacity.extendBoundedAllocation;
const text = value =>
  value === budget ? bytes.toString('utf8') : `${JSON.stringify(value, null, 2)}\n`;
const baselineBytes = bytes.byteLength - budget.allocations[0].pathBytesDelta[BUDGET];
const sha = value => value.repeat(40);
const paths = ['scripts/rehearse-repair.mjs', 'scripts/rehearse-repair.test.mjs'];
const plan = (path, change, category, maxBytesDelta, maxLines) => ({
  path,
  change,
  category,
  maxBytesDelta,
  maxLines,
});
function manifest(maxima = [800, 1_000]) {
  return validateRehearsalManifest({
    schemaVersion: 1,
    sliceId: 'REHEARSE-REPAIR',
    tier: 3,
    baseSha: sha('a'),
    origin: 'https://github.com/interdomestik/interdomestik.git',
    writerPaths: [BUDGET, ...paths].sort(),
    pathPlans: [
      plan(BUDGET, 'modify', 'config/data/messages', 0, 1_000),
      plan(paths[0], 'create', 'source/scripts', maxima[0], 200),
      plan(paths[1], 'create', 'tests/e2e', maxima[1], 300),
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
function facts({ writerPaths }) {
  return Object.fromEntries(
    writerPaths.map(path => {
      const isBudget = path === BUDGET;
      return [
        path,
        {
          bytes: 0,
          currentBytes: isBudget ? bytes.byteLength : 0,
          currentSha256: isBudget ? sha256(bytes) : null,
          files: isBudget ? 0 : 1,
          capacityBaselineExists: isBudget,
          manifestBaseExists: isBudget,
          currentExists: isBudget,
        },
      ];
    })
  );
}
function proposal(value, worktree = budget, protectedValue = budget) {
  return capacity.deriveCapacityProposal({
    budget: worktree,
    budgetText: text(worktree),
    protectedBudget: protectedValue,
    protectedBudgetText: text(protectedValue),
    manifest: value,
    baselineBudgetBytes: baselineBytes,
    writerDeltas: facts(value),
  });
}
test('bounded owner extension stays closed', () => {
  const existing = {
    id: 'owner',
    mode: 'bounded',
    writerPaths: ['scripts/existing.mjs'],
    maxTrackedBytesDelta: 200,
    maxTrackedFilesDelta: 1,
    maxCategoryBytesDelta: { 'source/scripts': 200 },
    maxPathBytesDelta: { 'scripts/existing.mjs': 200 },
  };
  const proposed = {
    id: 'owner',
    mode: 'bounded',
    writerPaths: ['scripts/existing.mjs', 'scripts/new.test.mjs'],
    maxPathBytesDelta: { 'scripts/existing.mjs': 250, 'scripts/new.test.mjs': 120 },
  };
  const result = extend(
    existing,
    proposed,
    { 'scripts/existing.mjs': 'source/scripts', 'scripts/new.test.mjs': 'tests/e2e' },
    { 'scripts/new.test.mjs': { capacityBaselineExists: false } }
  );
  assert.deepEqual(result.writerPaths, ['scripts/existing.mjs', 'scripts/new.test.mjs']);
  assert.equal(result.maxTrackedBytesDelta, 370);
  assert.equal(result.maxTrackedFilesDelta, 2);
  assert.deepEqual(result.maxCategoryBytesDelta, { 'source/scripts': 250, 'tests/e2e': 120 });
  const foreign = { ...proposed, id: 'foreign' };
  assert.throws(() => extend(existing, foreign, {}), /one bounded identity/u);
  assert.throws(() => extend(existing, proposed, {}), /category.*missing/u);
});
test('CUTOVER lineage', () => {
  const seed = { sliceId: 'T117B-CUTOVER', writerPaths: ['a', 'b'], routineOperations: [] };
  assert.equal(
    capacity.compileWriterClosure(seed).authorityStops[0].code,
    'writer:undeclared-cutover-lineage'
  );
  const hash = value => sha256(JSON.stringify(value));
  const prior = hash(['a']);
  const now = hash(seed.writerPaths);
  const role = (number, paths) => ({ number, changedPaths: paths, changedPathDigest: hash(paths) });
  const roles = [role(1683, ['a']), role(1675, ['b']), role(1686, ['c'])];
  const node = (digest, parentDigest, role, writerPaths) => ({
    changedPathDigest: role.changedPathDigest,
    digest,
    parentDigest,
    prNumber: role.number,
    writerPaths,
  });
  const a = node(prior, null, roles[0], ['a']);
  const b = node(now, prior, roles[1], ['a', 'b']);
  const chain = { currentDigest: now, history: [a, b], priorDigest: prior };
  const check = (value, declared = roles) =>
    capacity.compileWriterClosure({
      ...seed,
      routineOperations: [
        {
          operation: 'compile_same_slice_delivery',
          target: { prRoles: declared, writerLineage: value },
        },
      ],
    });
  assert.equal(check(chain).writerLineage.currentDigest, now);
  const invalid = [
    { ...chain, priorDigest: now },
    { ...chain, priorDigest: hash('missing') },
    { ...chain, currentDigest: hash('missing') },
    { ...chain, history: [b, a] },
    { ...chain, history: [a, node(hash(['a', 'c']), prior, roles[2], ['a', 'c']), b] },
    { ...chain, history: [a, node(prior, prior, roles[1], ['a'])] },
    { ...chain, history: [a, { ...b, prNumber: 9999 }] },
  ];
  for (const value of invalid) assert.ok(check(value).authorityStops.length);
  const drifted = structuredClone(roles);
  drifted[1].changedPaths = ['drift'];
  drifted[1].changedPathDigest = hash(drifted[1].changedPaths);
  assert.ok(check(chain, drifted).authorityStops.length);
});
test('candidate rebind rejects foreign drift', () => {
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
  const covered = manifest();
  const path = 'scripts/slice-rehearse-capacity.mjs';
  Object.assign(covered, {
    schemaVersion: 2,
    workClass: 'governance',
    capacityOwnerId: 'harness-v2-efficiency',
    writerPaths: [path],
    pathPlans: [plan(path, 'modify', 'source/scripts', 4_983, 300)],
    routineOperations: [],
  });
  const replay = proposal(validateRehearsalManifest(covered));
  assert.equal(replay.mode, 'existing');
  assert.deepEqual(replay.authorityStops, []);
});
test('projection preserves protected blob bytes', () => {
  const projection = validateRehearsalManifest({
    ...manifest(),
    sliceId: 'T117B-DATA',
    writerPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
    pathPlans: [
      plan('docs/plans/current-program.md', 'modify', 'docs/text', 500, 200),
      plan('docs/plans/current-tracker.md', 'modify', 'large support/generated-ish', 500, 200),
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
  const present = (path, deltaBytes, baseline) => ({
    bytes: deltaBytes,
    currentBytes: baseline ? 1_000 : deltaBytes,
    currentSha256: sha256(path),
    files: Number(!baseline),
    capacityBaselineExists: baseline,
    ...(baseline ? { manifestBaseExists: true } : {}),
    currentExists: true,
  });
  const deltas = Object.fromEntries(
    projection.writerPaths.map(path => [path, present(path, 100, true)])
  );
  const owner = budget.allocations.find(item => item.id === 't116-case-summary');
  const capacityOwnerDeltas = Object.fromEntries(
    owner.writerPaths.map(path => {
      if (deltas[path]) return [path, deltas[path]];
      const deltaBytes = owner.maxPathBytesDelta[path] - 1_000;
      return [path, present(path, deltaBytes, false)];
    })
  );
  const result = capacity.deriveCapacityProposal({
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
test('capacity stops combine with exact-head proof', () => {
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
