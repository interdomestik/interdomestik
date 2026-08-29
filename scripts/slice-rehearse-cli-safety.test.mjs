import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from './slice-rehearse-core.mjs';
import { runSliceRehearsal } from './slice-rehearse.mjs';

const GIT = '/usr/bin/git';
const ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

function git(repository, args) {
  return execFileSync(GIT, args, { cwd: repository, encoding: 'utf8', env: ENV }).trim();
}

function minimalBudget(protectedMainSha) {
  const categories = {};
  for (const category of [
    'config/data/messages',
    'docs/text',
    'large support/generated-ish',
    'other',
    'source/scripts',
    'tests/e2e',
  ]) {
    categories[category] = 1;
  }
  const allocation = {
    id: 'fixture',
    mode: 'exact',
    writerPaths: ['declared.txt'],
    trackedBytesDelta: 0,
    trackedFilesDelta: 0,
    categoryBytesDelta: {},
    pathBytesDelta: { 'declared.txt': 0 },
  };
  return {
    version: 2,
    baseline: { protectedMainSha, trackedBytes: 6, trackedFiles: 1, categoryBytes: categories },
    allocations: [allocation],
    reserve: {
      trackedBytes: 0,
      trackedFiles: 0,
      categoryBytes: {},
      rationale: 'No fixture reserve is needed for this test repository.',
    },
    maxTrackedBytes: 6,
    maxTrackedFiles: 1,
    maxCategoryBytes: categories,
    maxLargestFileBytes: 1024,
    maxSourceOrTestLines: 100,
  };
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), 'slice-rehearse-cli-safety-'));
  const repository = join(root, 'repo');
  execFileSync(GIT, ['init', '-q', '-b', 'main', repository], { env: ENV });
  for (const args of [
    ['config', 'user.email', 'harness@example.test'],
    ['config', 'user.name', 'Harness Test'],
    ['remote', 'add', 'origin', 'https://github.com/example/rehearse.git'],
  ]) {
    git(repository, args);
  }
  execFileSync('/bin/mkdir', ['-p', join(repository, 'scripts')], { env: ENV });
  writeFileSync(join(repository, 'declared.txt'), 'base\n');
  writeFileSync(
    join(repository, 'scripts/repo-size-budget.json'),
    canonicalJson(minimalBudget('0'.repeat(40)))
  );
  git(repository, ['add', '.']);
  git(repository, ['commit', '-q', '-m', 'baseline']);
  const baselineSha = git(repository, ['rev-parse', 'HEAD']);
  writeFileSync(
    join(repository, 'scripts/repo-size-budget.json'),
    canonicalJson(minimalBudget(baselineSha))
  );
  git(repository, ['add', '.']);
  git(repository, ['commit', '-q', '-m', 'current budget']);
  const headSha = git(repository, ['rev-parse', 'HEAD']);
  return { root, repository, baselineSha, headSha };
}

function manifest(baseSha) {
  const path = 'declared.txt';
  const proof = {
    commands: ['node --test'],
    heavyLanes: [],
    fullGateRequired: false,
    workflowDigest: 'a'.repeat(64),
    substrateDigest: 'b'.repeat(64),
  };
  return Object.assign(
    {
      schemaVersion: 1,
      sliceId: 'HARNESS-V2-CLI',
      tier: 1,
      baseSha,
      origin: 'https://github.com/example/rehearse.git',
      writerPaths: [path],
      pathPlans: [
        {
          path,
          change: 'modify',
          maxBytesDelta: 32,
          maxLines: 10,
          category: 'docs/text',
        },
      ],
      routineOperations: [],
      proof,
      evidenceReceipts: [],
    },
    {
      topology: Object.freeze({
        closeoutMode: 'none',
        projectionPaths: [],
        repairPaths: [],
        repairAllocationId: null,
      }),
    }
  );
}

function rehearse(fixture, options) {
  return runSliceRehearsal({
    readProtectedMain: () => fixture.headSha,
    collectVerifiedEvidence: () => ({}),
    ...options,
  });
}

test('fails closed without partial JSON for malformed input or missing baseline blob', () => {
  const fixture = createRepository();
  try {
    const malformedPath = join(fixture.root, 'malformed.json');
    writeFileSync(malformedPath, '{');
    const output = [];
    const errors = [];
    assert.equal(
      rehearse(fixture, {
        argv: ['--manifest', malformedPath],
        cwd: fixture.repository,
        stdout: value => output.push(value),
        stderr: value => errors.push(value),
      }),
      1
    );
    assert.deepEqual(output, []);
    assert.match(errors.join(''), /manifest/i);

    const manifestPath = join(fixture.root, 'manifest.json');
    writeFileSync(manifestPath, canonicalJson(manifest(fixture.headSha)));
    const budgetPath = join(fixture.repository, 'scripts/repo-size-budget.json');
    const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
    budget.baseline.protectedMainSha = 'f'.repeat(40);
    writeFileSync(budgetPath, canonicalJson(budget));
    git(fixture.repository, ['add', 'scripts/repo-size-budget.json']);
    git(fixture.repository, ['commit', '-q', '-m', 'missing baseline fixture']);
    const missingOutput = [];
    const missingErrors = [];
    assert.equal(
      rehearse(fixture, {
        argv: ['--manifest', manifestPath],
        cwd: fixture.repository,
        readProtectedMain: () => git(fixture.repository, ['rev-parse', 'HEAD']),
        stdout: value => missingOutput.push(value),
        stderr: value => missingErrors.push(value),
        evaluate: () => assert.fail('evaluator must not run without baseline budget evidence'),
      }),
      1
    );
    assert.deepEqual(missingOutput, []);
    assert.match(missingErrors.join(''), /baseline budget/i);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('rejects symlink manifest and budget inputs before reading them', () => {
  const fixture = createRepository();
  try {
    const realManifest = join(fixture.root, 'manifest.json');
    const linkedManifest = join(fixture.root, 'manifest-link.json');
    writeFileSync(realManifest, canonicalJson(manifest(fixture.headSha)));
    symlinkSync(realManifest, linkedManifest);
    const manifestErrors = [];
    assert.equal(
      rehearse(fixture, {
        argv: ['--manifest', linkedManifest],
        cwd: fixture.repository,
        stdout: () => assert.fail('unsafe manifest must not produce JSON'),
        stderr: value => manifestErrors.push(value),
      }),
      1
    );
    assert.match(manifestErrors.join(''), /regular file|symlink/iu);

    const budgetPath = join(fixture.repository, 'scripts/repo-size-budget.json');
    const externalBudget = join(fixture.root, 'external-budget.json');
    writeFileSync(externalBudget, readFileSync(budgetPath));
    rmSync(budgetPath);
    symlinkSync(externalBudget, budgetPath);
    const budgetErrors = [];
    assert.equal(
      rehearse(fixture, {
        argv: ['--manifest', realManifest],
        cwd: fixture.repository,
        readProtectedMain: () => fixture.headSha,
        stdout: () => assert.fail('unsafe budget must not produce JSON'),
        stderr: value => budgetErrors.push(value),
      }),
      1
    );
    assert.match(budgetErrors.join(''), /regular file|symlink/iu);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('reports valid worktree budget drift against protected main', () => {
  const fixture = createRepository();
  try {
    const manifestPath = join(fixture.root, 'manifest.json');
    writeFileSync(manifestPath, canonicalJson(manifest(fixture.headSha)));
    const budgetPath = join(fixture.repository, 'scripts/repo-size-budget.json');
    const worktreeBudget = JSON.parse(readFileSync(budgetPath, 'utf8'));
    worktreeBudget.reserve.rationale = `${worktreeBudget.reserve.rationale} Candidate drift.`;
    writeFileSync(budgetPath, canonicalJson(worktreeBudget));
    const output = [];
    const errors = [];
    assert.equal(
      rehearse(fixture, {
        argv: ['--manifest', manifestPath],
        cwd: fixture.repository,
        readProtectedMain: () => fixture.headSha,
        stdout: value => output.push(value),
        stderr: value => errors.push(value),
      }),
      2,
      errors.join('')
    );
    assert.deepEqual(errors, []);
    const report = JSON.parse(output.join(''));
    assert.ok(report.authorityStops.some(item => item.code === 'capacity:worktree-budget-drift'));
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('does not grant sensitive cleanup without independent operation facts', () => {
  const fixture = createRepository();
  try {
    const value = manifest(fixture.headSha);
    value.routineOperations = [
      {
        operation: 'task_owned_cleanup',
        target: {
          taskId: 'HARNESS-V2-CLI',
          artifactPaths: ['/private/tmp/harness-v2-cli'],
        },
        preconditions: { authorityInactive: true },
      },
    ];
    const manifestPath = join(fixture.root, 'manifest.json');
    writeFileSync(manifestPath, canonicalJson(value));
    const output = [];
    const errors = [];
    assert.equal(
      rehearse(fixture, {
        argv: ['--manifest', manifestPath],
        cwd: fixture.repository,
        readProtectedMain: () => fixture.headSha,
        stdout: chunk => output.push(chunk),
        stderr: chunk => errors.push(chunk),
      }),
      2,
      errors.join('')
    );
    assert.deepEqual(errors, []);
    const report = JSON.parse(output.join(''));
    assert.equal(report.repository.operationFacts, null);
    assert.ok(
      report.authorityStops.some(
        item =>
          item.code === 'envelope:operation-precondition-unverified' &&
          item.operation === 'task_owned_cleanup' &&
          item.reason === 'authority-facts-unavailable'
      ),
      JSON.stringify(report.authorityStops)
    );
    assert.equal(report.operationalEnvelope, null);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
