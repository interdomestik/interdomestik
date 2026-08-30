import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { sha256, validateRehearsalManifest } from './slice-rehearse-core.mjs';
import { evaluateRehearsal } from './slice-rehearse-evaluator.mjs';
import {
  normalizeRepositoryFacts,
  repositoryAuthorityStops,
} from './slice-rehearse-repository-facts.mjs';
import { evaluateWriterPolicy } from './slice-rehearse-writer-policy.mjs';

const sha = value => value.repeat(40);
const categories = {
  'config/data/messages': 0,
  'docs/text': 0,
  'large support/generated-ish': 0,
  other: 0,
  'source/scripts': 0,
  'tests/e2e': 0,
};

function plan(path, change) {
  return { path, change, category: 'source/scripts', maxBytesDelta: 1_000, maxLines: 200 };
}

function manifest() {
  return {
    origin: 'https://github.com/interdomestik/interdomestik.git',
    baseSha: sha('a'),
    writerPaths: ['scripts/create.mjs', 'scripts/modify.mjs'],
    pathPlans: [plan('scripts/create.mjs', 'create'), plan('scripts/modify.mjs', 'modify')],
  };
}

function repository() {
  return normalizeRepositoryFacts({
    root: '/repo',
    origin: 'git@github.com:interdomestik/interdomestik.git',
    headSha: sha('b'),
    treeSha: sha('c'),
    baseSha: sha('a'),
    capacityBaseSha: sha('a'),
    protectedMainSha: sha('a'),
    mergeBaseSha: sha('a'),
    baseIsAncestor: true,
    branch: 'codex/rehearse',
    committedChangedPaths: [],
    protectedMainAdvancedPaths: [],
    dirtyPaths: [],
    tracked: { files: 1, bytes: 1, categoryBytes: categories },
    writerLineCounts: { 'scripts/create.mjs': 0, 'scripts/modify.mjs': 1 },
    writerDeltas: {
      'scripts/create.mjs': {
        bytes: 0,
        currentBytes: 0,
        currentSha256: null,
        files: 0,
        capacityBaselineExists: false,
        manifestBaseExists: false,
        currentExists: false,
      },
      'scripts/modify.mjs': {
        bytes: 0,
        currentBytes: 1,
        currentSha256: sha256('modify'),
        files: 0,
        capacityBaselineExists: true,
        manifestBaseExists: true,
        currentExists: true,
      },
    },
  });
}

test('committed scope and independent protected-main base fail closed', () => {
  const candidate = manifest();
  candidate.baseSha = sha('b');
  const facts = repository();
  facts.committedChangedPaths = ['outside.txt', ...candidate.writerPaths].sort();
  const stops = repositoryAuthorityStops(candidate, facts);
  assert.deepEqual(stops, [
    { code: 'repository:outside-writer-committed', paths: ['outside.txt'] },
    { code: 'repository:base-identity-mismatch' },
  ]);
});

test('modify writers must exist while an undeveloped create writer may be absent', () => {
  const candidate = manifest();
  const createAbsent = repositoryAuthorityStops(candidate, repository());
  assert.deepEqual(createAbsent, []);

  const missingModify = repository();
  missingModify.writerDeltas['scripts/modify.mjs'].currentExists = false;
  missingModify.writerDeltas['scripts/modify.mjs'].currentBytes = 0;
  missingModify.writerDeltas['scripts/modify.mjs'].currentSha256 = null;
  assert.deepEqual(repositoryAuthorityStops(candidate, missingModify), [
    { code: 'repository:writer-missing:scripts/modify.mjs' },
  ]);

  delete missingModify.writerDeltas['scripts/modify.mjs'];
  assert.ok(
    repositoryAuthorityStops(candidate, missingModify).some(
      item => item.code === 'repository:writer-facts-incomplete'
    )
  );
});

test('origin identity normalizes SSH and rejects a fork or protected-main writer overlap', () => {
  const normalized = repository();
  assert.equal(normalized.origin, 'https://github.com/interdomestik/interdomestik.git');
  assert.equal(normalized.providerRepository, 'interdomestik/interdomestik');

  const fork = repository();
  fork.origin = 'https://github.com/example/interdomestik.git';
  fork.providerRepository = 'example/interdomestik';
  assert.ok(
    repositoryAuthorityStops(manifest(), fork).some(
      item => item.code === 'repository:provider-repository-mismatch'
    )
  );

  const overlap = repository();
  overlap.protectedMainAdvancedPaths = ['scripts/modify.mjs'];
  assert.ok(
    repositoryAuthorityStops(manifest(), overlap).some(
      item => item.code === 'repository:protected-main-writer-overlap'
    )
  );
});

test('writer policy uses absolute global caps and skips line caps without a canonical limit', () => {
  const policy = evaluateWriterPolicy(
    {
      pathPlans: [
        { path: 'config/unowned.json', change: 'modify', maxBytesDelta: 5, maxLines: 1 },
        { path: 'scripts/worker.mjs', change: 'modify', maxBytesDelta: 5, maxLines: 20 },
      ],
    },
    {
      writerLineCounts: { 'config/unowned.json': 99, 'scripts/worker.mjs': 11 },
      writerDeltas: {
        'config/unowned.json': { bytes: 0, currentBytes: 101, manifestBaseExists: true },
        'scripts/worker.mjs': { bytes: 0, currentBytes: 1, manifestBaseExists: true },
      },
    },
    { maxLargestFileBytes: 100, maxSourceOrTestLines: 10 }
  );
  assert.ok(policy.authorityStops.some(item => item.code.includes('structured-owner-missing')));
  assert.ok(policy.authorityStops.some(item => item.code.includes('largest-file-current')));
  assert.ok(policy.authorityStops.some(item => item.code.includes('source-or-test-lines-current')));
  assert.equal(
    policy.deficits.some(item => item.code.includes('config/unowned.json')),
    false
  );
});

test('global capacity is an authority stop and governance bytes use the absolute limit', () => {
  const budgetBytes = readFileSync(new URL('./repo-size-budget.json', import.meta.url));
  const budget = JSON.parse(budgetBytes);
  const writerPaths = ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'];
  const candidate = validateRehearsalManifest({
    schemaVersion: 1,
    sliceId: 'T117B-DATA',
    tier: 3,
    baseSha: sha('d'),
    origin: 'https://github.com/interdomestik/interdomestik.git',
    writerPaths,
    pathPlans: [
      {
        path: writerPaths[0],
        change: 'modify',
        category: 'docs/text',
        maxBytesDelta: 2_000,
        maxLines: 200,
      },
      {
        path: writerPaths[1],
        change: 'modify',
        category: 'large support/generated-ish',
        maxBytesDelta: 2_000,
        maxLines: 200,
      },
    ],
    routineOperations: ['extract_cohesive_helper', 'fresh_worktree_patch_replay'],
    proof: {
      commands: ['pnpm plan:status'],
      heavyLanes: [],
      fullGateRequired: false,
      workflowDigest: sha256('workflow'),
      substrateDigest: sha256('substrate'),
    },
    evidenceReceipts: [],
    topology: {
      closeoutMode: 'projection-only',
      projectionPaths: writerPaths,
      repairAllocationId: null,
      repairPaths: [],
    },
  });
  const facts = {
    root: '/repo',
    origin: candidate.origin,
    headSha: candidate.baseSha,
    treeSha: sha('e'),
    baseSha: candidate.baseSha,
    capacityBaseSha: candidate.baseSha,
    protectedMainSha: candidate.baseSha,
    mergeBaseSha: candidate.baseSha,
    baseIsAncestor: true,
    branch: 'codex/closeout',
    committedChangedPaths: [],
    protectedMainAdvancedPaths: ['README.md'],
    dirtyPaths: writerPaths,
    tracked: {
      files: budget.maxTrackedFiles + 1,
      bytes: budget.maxTrackedBytes,
      categoryBytes: budget.maxCategoryBytes,
    },
    writerLineCounts: Object.fromEntries(writerPaths.map(path => [path, 50])),
    writerDeltas: Object.fromEntries(
      writerPaths.map((path, index) => [
        path,
        {
          bytes: 100,
          currentBytes: index === 0 ? 128 * 1024 + 1 : 1_000,
          currentSha256: sha256(path),
          files: 0,
          capacityBaselineExists: true,
          manifestBaseExists: true,
          currentExists: true,
        },
      ])
    ),
  };
  facts.writerDeltas[writerPaths[0]].manifestBaseExists = false;
  facts.writerDeltas[writerPaths[0]].currentBytes = budget.maxLargestFileBytes + 1;
  facts.writerDeltas[writerPaths[1]].bytes = 2_001;
  const report = evaluateRehearsal({
    manifest: candidate,
    repository: facts,
    budget,
    budgetText: budgetBytes.toString('utf8'),
    protectedBudget: budget,
    protectedBudgetText: budgetBytes.toString('utf8'),
    baselineBudgetBytes:
      budgetBytes.byteLength -
      budget.allocations[0].pathBytesDelta['scripts/repo-size-budget.json'],
  });
  assert.ok(report.authorityStops.some(item => item.code === 'capacity:global-tracked-files'));
  assert.ok(report.authorityStops.some(item => item.code.endsWith(writerPaths[0])));
  assert.ok(report.authorityStops.some(item => item.code.includes('largest-file-current')));
  assert.ok(report.authorityStops.some(item => item.code.endsWith(writerPaths[1])));
  assert.ok(
    report.deficits.some(
      item => item.code === 'modularity:absolute-byte-cap:docs/plans/current-program.md'
    )
  );
  assert.ok(report.deficits.some(item => item.code === 'repository:protected-main-advanced'));
  assert.equal(report.operationalEnvelope, null);
});
