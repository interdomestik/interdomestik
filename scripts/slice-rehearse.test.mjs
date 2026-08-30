import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalJson, sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import { deriveOperationalEnvelope, evaluateRehearsal } from './slice-rehearse-evaluator.mjs';

const budgetBytes = readFileSync(new URL('./repo-size-budget.json', import.meta.url));
const budget = JSON.parse(budgetBytes);
const sha = value => value.repeat(40);
const baselineBudgetBytes =
  budgetBytes.byteLength - budget.allocations[0].pathBytesDelta['scripts/repo-size-budget.json'];
function unattributedBudget() {
  const value = structuredClone(budget);
  const harness = value.allocations.find(item => item.id === 'harness-v2-efficiency');
  value.allocations = value.allocations.filter(item => item.id !== 'harness-v2-efficiency');
  const capacity = value.allocations.find(item => item.id === 'capacity-rebase');
  const selfAdjustment = capacity.pathBytesDelta['scripts/repo-size-budget.json'] - 15_828;
  capacity.pathBytesDelta['scripts/repo-size-budget.json'] = 15_828;
  capacity.trackedBytesDelta -= selfAdjustment;
  capacity.categoryBytesDelta['config/data/messages'] -= selfAdjustment;
  value.maxTrackedBytes -= harness.maxTrackedBytesDelta + selfAdjustment;
  value.maxTrackedFiles -= harness.maxTrackedFilesDelta;
  for (const [category, bytes] of Object.entries(harness.maxCategoryBytesDelta)) {
    value.maxCategoryBytes[category] -= bytes;
  }
  value.maxCategoryBytes['config/data/messages'] -= selfAdjustment;
  return value;
}
function manifest(overrides = {}) {
  const writerPaths = [
    'package.json',
    'scripts/slice-rehearse-core.mjs',
    'scripts/slice-rehearse.test.mjs',
  ];
  return {
    schemaVersion: 1,
    sliceId: 'HARNESS-V2',
    tier: 3,
    baseSha: sha('a'),
    origin: 'https://github.com/interdomestik/interdomestik.git',
    writerPaths,
    pathPlans: writerPaths.map((path, index) => ({
      path,
      change: index === 0 ? 'modify' : 'create',
      category: index === 2 ? 'tests/e2e' : index === 0 ? 'config/data/messages' : 'source/scripts',
      maxBytesDelta: 8_000,
      maxLines: index === 2 ? 300 : index === 0 ? 250 : 200,
    })),
    routineOperations: ['add_focused_test', 'derived_capacity_rebind', 'extract_cohesive_helper'],
    proof: {
      commands: ['node --test scripts/slice-rehearse.test.mjs'],
      heavyLanes: ['pr-e2e'],
      fullGateRequired: true,
      workflowDigest: sha256('workflow-contract'),
      substrateDigest: sha256('runner-substrate'),
    },
    evidenceReceipts: [],
    topology: {
      closeoutMode: 'none',
      repairAllocationId: null,
      repairPaths: [],
      projectionPaths: [],
    },
    ...overrides,
  };
}
function capacityManifest() {
  const writerPaths = [
    'scripts/repo-size-budget.json',
    'scripts/slice-harness-new.mjs',
    'scripts/slice-harness-new.test.mjs',
  ];
  return validateRehearsalManifest(
    manifest({
      sliceId: 'HARNESS-V2-EFFICIENCY',
      writerPaths,
      pathPlans: [
        {
          path: writerPaths[0],
          change: 'modify',
          category: 'config/data/messages',
          maxBytesDelta: 0,
          maxLines: 300,
        },
        {
          path: writerPaths[1],
          change: 'create',
          category: 'source/scripts',
          maxBytesDelta: 4_000,
          maxLines: 200,
        },
        {
          path: writerPaths[2],
          change: 'create',
          category: 'tests/e2e',
          maxBytesDelta: 5_000,
          maxLines: 300,
        },
      ],
    })
  );
}
function repository(candidate, overrides = {}) {
  const writerDeltas = Object.fromEntries(
    candidate.writerPaths.map(path => [
      path,
      {
        bytes: path.endsWith('.test.mjs') ? 5_000 : path.endsWith('-new.mjs') ? 4_000 : 0,
        currentBytes: path.endsWith('.test.mjs') ? 5_000 : path.endsWith('-new.mjs') ? 4_000 : 1,
        currentSha256: sha256(path),
        files: path === 'scripts/repo-size-budget.json' ? 0 : 1,
        capacityBaselineExists: path === 'scripts/repo-size-budget.json',
        manifestBaseExists: path === 'scripts/repo-size-budget.json',
        currentExists: true,
      },
    ])
  );
  const facts = {
    root: '/repo',
    origin: candidate.origin,
    headSha: candidate.baseSha,
    treeSha: sha('b'),
    baseSha: candidate.baseSha,
    capacityBaseSha: candidate.baseSha,
    protectedMainSha: candidate.baseSha,
    mergeBaseSha: candidate.baseSha,
    baseIsAncestor: true,
    branch: 'codex/harness-v2',
    committedChangedPaths: [],
    protectedMainAdvancedPaths: [],
    dirtyPaths: candidate.writerPaths,
    tracked: { files: 5_860, bytes: 59_618_305, categoryBytes: budget.baseline.categoryBytes },
    writerLineCounts: Object.fromEntries(candidate.writerPaths.map(path => [path, 0])),
    writerDeltas,
  };
  return {
    ...facts,
    ...overrides,
    writerLineCounts: { ...facts.writerLineCounts, ...overrides.writerLineCounts },
    writerDeltas: { ...facts.writerDeltas, ...overrides.writerDeltas },
  };
}
function evaluate(candidate, repo = repository(candidate)) {
  const protectedBudget = unattributedBudget();
  const protectedBudgetText = canonicalJson(protectedBudget);
  return evaluateRehearsal({
    manifest: candidate,
    repository: repo,
    budget: protectedBudget,
    budgetText: protectedBudgetText,
    protectedBudget,
    protectedBudgetText,
    baselineBudgetBytes,
  });
}
test('validates the closed manifest and derives canonical policy', () => {
  const actual = validateRehearsalManifest(manifest());
  assert.deepEqual(actual.writerPaths, [...actual.writerPaths].sort());
  assert.deepEqual(actual.routineOperations, [...actual.routineOperations].sort());
  assert.equal(actual.proof.fullGateRequired, true);
  const tierOne = manifest({ tier: 1, proof: { ...manifest().proof, fullGateRequired: false } });
  assert.equal(validateRehearsalManifest(tierOne).proof.fullGateRequired, true);
  const wrongCategory = manifest();
  wrongCategory.pathPlans[1].category = 'docs/text';
  assert.throws(() => validateRehearsalManifest(wrongCategory), /canonical category/u);
  const oversized = manifest();
  oversized.pathPlans[1].maxLines = 201;
  assert.throws(() => validateRehearsalManifest(oversized), /canonical line cap/u);

  const workflow = manifest({
    writerPaths: ['.github/workflows/ci.yml'],
    pathPlans: [
      {
        path: '.github/workflows/ci.yml',
        change: 'modify',
        category: 'config/data/messages',
        maxBytesDelta: 24,
        maxLines: 191,
      },
    ],
  });
  assert.equal(validateRehearsalManifest(workflow).writerPaths[0], '.github/workflows/ci.yml');
});
test('enforces canonical projection topology and closed manifest keys', () => {
  const base = manifest();
  const closeout = ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'];
  const writerPaths = [...base.writerPaths, ...closeout].sort();
  const pathPlans = [
    ...base.pathPlans,
    {
      path: closeout[0],
      change: 'modify',
      category: 'docs/text',
      maxBytesDelta: 1_000,
      maxLines: 100,
    },
    {
      path: closeout[1],
      change: 'modify',
      category: 'large support/generated-ish',
      maxBytesDelta: 1_000,
      maxLines: 100,
    },
  ];
  const topology = (projectionPaths, repairPaths) =>
    manifest({
      writerPaths,
      pathPlans,
      topology: {
        closeoutMode: 'projection-only',
        projectionPaths,
        repairAllocationId: repairPaths.length ? 'harness-repair' : null,
        repairPaths,
      },
    });
  assert.throws(
    () => validateRehearsalManifest(topology(closeout, [closeout[0], ...base.writerPaths])),
    /disjoint/u
  );
  assert.throws(() => validateRehearsalManifest(topology(closeout, [])), /exactly cover/u);
  assert.throws(
    () =>
      validateRehearsalManifest(
        manifest({
          topology: {
            closeoutMode: 'none',
            projectionPaths: ['package.json'],
            repairAllocationId: null,
            repairPaths: [],
          },
        })
      ),
    /must be empty/u
  );
  assert.throws(() => validateRehearsalManifest({ ...manifest(), unexpected: true }), /keys/u);
});
test('returns exact report and a whole-chain operational envelope', () => {
  const candidate = capacityManifest();
  candidate.proof = { ...candidate.proof, fullGateRequired: false };
  candidate.routineOperations = [...candidate.routineOperations, 'rerun_invalidated_proof'];
  const report = evaluate(
    candidate,
    repository(candidate, {
      writerLineCounts: { 'scripts/slice-harness-new.mjs': 201 },
    })
  );
  assert.deepEqual(Object.keys(report).sort(), [
    'authorityStops',
    'capacity',
    'deficits',
    'evidence',
    'modularity',
    'operationalEnvelope',
    'reportSha256',
    'repository',
    'schemaVersion',
    'sliceId',
    'tier',
    'topology',
    'writers',
  ]);
  assert.deepEqual(report.authorityStops, []);
  assert.ok(report.deficits.some(item => item.code === 'capacity:new-files'));
  assert.equal(
    report.deficits.some(item => item.code === 'proof:full-gate'),
    false
  );
  assert.ok(report.deficits.some(item => item.code.includes('modularity:line-cap')));
  const envelope = deriveOperationalEnvelope(report);
  assert.deepEqual(
    envelope.routineOperations,
    validateRehearsalManifest(candidate).routineOperations
  );
  assert.deepEqual(
    envelope.requiredOperations,
    [...new Set(report.deficits.map(item => item.coveredBy).filter(Boolean))].sort()
  );
  const { reportSha256: _digest, ...payload } = report;
  assert.equal(report.reportSha256, sha256(canonicalJson({ ...payload, reportSha256: null })));
  const { operationalEnvelope: _envelope, ...facts } = payload;
  assert.equal(
    report.operationalEnvelope.factsSha256,
    sha256(canonicalJson({ ...facts, operationalEnvelope: null, reportSha256: null }))
  );
  const stopped = evaluate(
    candidate,
    repository(candidate, { dirtyPaths: [...candidate.writerPaths, 'outside.txt'] })
  );
  assert.match(JSON.stringify(stopped.authorityStops), /repository:outside-writer-dirty/u);
  assert.throws(() => deriveOperationalEnvelope(stopped), /authority stop/u);

  const otherTier = evaluate({ ...candidate, tier: 4 }, repository(candidate));
  assert.notEqual(report.reportSha256, otherTier.reportSha256);
  assert.notEqual(
    report.operationalEnvelope.factsSha256,
    otherTier.operationalEnvelope.factsSha256
  );
});
