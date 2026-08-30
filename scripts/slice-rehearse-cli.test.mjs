import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-core.mjs';
import { collectRepositoryFacts, runSliceRehearsal } from './slice-rehearse.mjs';

const GIT = '/usr/bin/git';
const ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

function git(repository, args) {
  return execFileSync(GIT, args, { cwd: repository, encoding: 'utf8', env: ENV }).trim();
}

function gitShow(repository, spec) {
  return execFileSync(GIT, ['show', spec], { cwd: repository, encoding: 'utf8', env: ENV });
}

function minimalBudget(protectedMainSha) {
  const categories = {
    'config/data/messages': 1,
    'docs/text': 1,
    'large support/generated-ish': 1,
    other: 1,
    'source/scripts': 1,
    'tests/e2e': 1,
  };
  return {
    version: 2,
    baseline: {
      protectedMainSha,
      trackedBytes: 6,
      trackedFiles: 1,
      categoryBytes: categories,
    },
    allocations: [
      {
        id: 'fixture',
        mode: 'exact',
        writerPaths: ['declared.txt'],
        trackedBytesDelta: 0,
        trackedFilesDelta: 0,
        categoryBytesDelta: {},
        pathBytesDelta: { 'declared.txt': 0 },
      },
    ],
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
  const root = mkdtempSync(join(tmpdir(), 'slice-rehearse-cli-'));
  const repository = join(root, 'repo');
  execFileSync(GIT, ['init', '-q', '-b', 'main', repository], { env: ENV });
  git(repository, ['config', 'user.email', 'harness@example.test']);
  git(repository, ['config', 'user.name', 'Harness Test']);
  git(repository, ['remote', 'add', 'origin', 'https://github.com/example/rehearse.git']);
  execFileSync('/bin/mkdir', ['-p', join(repository, 'scripts')], { env: ENV });
  writeFileSync(join(repository, 'declared.txt'), 'base\n');
  writeFileSync(
    join(repository, 'scripts/repo-size-budget.json'),
    `${JSON.stringify(minimalBudget('0'.repeat(40)), null, 2)}\n\n`
  );
  git(repository, ['add', '.']);
  git(repository, ['commit', '-q', '-m', 'baseline']);
  const baselineSha = git(repository, ['rev-parse', 'HEAD']);
  writeFileSync(
    join(repository, 'scripts/repo-size-budget.json'),
    `${JSON.stringify(minimalBudget(baselineSha), null, 2)}\n`
  );
  git(repository, ['add', '.']);
  git(repository, ['commit', '-q', '-m', 'current budget']);
  const headSha = git(repository, ['rev-parse', 'HEAD']);
  return { root, repository, baselineSha, headSha };
}

function manifest(baseSha) {
  return {
    schemaVersion: 1,
    sliceId: 'HARNESS-V2-CLI',
    tier: 1,
    baseSha,
    origin: 'https://github.com/example/rehearse.git',
    writerPaths: ['declared.txt'],
    pathPlans: [
      {
        path: 'declared.txt',
        change: 'modify',
        maxBytesDelta: 32,
        maxLines: 10,
        category: 'docs/text',
      },
    ],
    routineOperations: [],
    proof: {
      commands: ['z-test', 'a-test'],
      heavyLanes: [],
      fullGateRequired: false,
      workflowDigest: 'a'.repeat(64),
      substrateDigest: 'b'.repeat(64),
    },
    evidenceReceipts: [],
    topology: {
      closeoutMode: 'none',
      projectionPaths: [],
      repairPaths: [],
      repairAllocationId: null,
    },
  };
}

function rehearse(fixture, options) {
  return runSliceRehearsal({
    readProtectedMain: () => fixture.headSha,
    collectVerifiedEvidence: () => ({}),
    ...options,
  });
}

test('collectRepositoryFacts returns exact sorted local Git and tracked-size facts without mutation', () => {
  const fixture = createRepository();
  try {
    writeFileSync(join(fixture.repository, 'declared.txt'), 'changed\n');
    writeFileSync(join(fixture.repository, 'outside.txt'), 'outside\n');
    const before = git(fixture.repository, ['status', '--porcelain=v1', '--untracked-files=all']);

    const facts = collectRepositoryFacts({
      cwd: fixture.repository,
      baseSha: fixture.baselineSha,
      protectedMainSha: fixture.headSha,
      writerPaths: ['declared.txt'],
    });
    assert.equal(facts.root, realpathSync(fixture.repository));
    assert.equal(facts.origin, 'https://github.com/example/rehearse.git');
    assert.equal(facts.headSha, fixture.headSha);
    assert.equal(facts.treeSha, git(fixture.repository, ['rev-parse', 'HEAD^{tree}']));
    assert.equal(facts.baseSha, fixture.baselineSha);
    assert.equal(facts.branch, 'main');
    assert.deepEqual(facts.committedChangedPaths, []);
    assert.deepEqual(facts.dirtyPaths, ['declared.txt', 'outside.txt']);
    assert.deepEqual(facts.dirtyWriterPaths, ['declared.txt']);
    assert.deepEqual(facts.writerLineCounts, { 'declared.txt': 1 });
    assert.deepEqual(facts.writerFacts, {
      'declared.txt': {
        currentBytes: 8,
        currentExists: true,
        currentSha256: sha256('changed\n'),
        manifestBaseBytes: 5,
        manifestBaseExists: true,
      },
    });
    assert.match(facts.writerFactsDigest, /^[0-9a-f]{64}$/u);
    assert.deepEqual(facts.writerDeltas, {
      'declared.txt': {
        baseBytes: 5,
        bytes: 3,
        capacityBaselineExists: true,
        currentBytes: 8,
        currentSha256: sha256('changed\n'),
        currentExists: true,
        files: 0,
        manifestBaseExists: true,
      },
    });
    assert.ok(facts.tracked.files >= 2);
    assert.ok(facts.tracked.bytes > 0);
    assert.equal(
      Object.values(facts.tracked.categoryBytes).reduce((sum, bytes) => sum + bytes, 0),
      facts.tracked.bytes
    );
    assert.equal(
      git(fixture.repository, ['status', '--porcelain=v1', '--untracked-files=all']),
      before
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('runSliceRehearsal validates through the core and emits canonical reports with exit 0 or 2', () => {
  const fixture = createRepository();
  try {
    const manifestPath = join(fixture.root, 'manifest.json');
    writeFileSync(manifestPath, canonicalJson(manifest(fixture.headSha)));
    const output = [];
    let received;
    const exitCode = rehearse(fixture, {
      argv: ['--manifest', manifestPath],
      cwd: fixture.repository,
      collectVerifiedEvidence: () => ({
        'pr-e2e': [
          {
            provider: 'github',
            key: '9'.repeat(64),
            checkId: 41,
            runId: 42,
            completedAt: '2099-01-01T00:00:00.000Z',
          },
        ],
      }),
      stdout: value => output.push(value),
      stderr: () => assert.fail('valid rehearsal must not write stderr'),
      evaluate: input => {
        received = input;
        return { schemaVersion: 1, sliceId: input.manifest.sliceId, authorityStops: [] };
      },
    });

    assert.equal(exitCode, 0);
    assert.equal(
      output.join(''),
      canonicalJson({
        schemaVersion: 1,
        sliceId: 'HARNESS-V2-CLI',
        authorityStops: [],
      })
    );
    assert.equal(received.manifest.sliceId, 'HARNESS-V2-CLI');
    assert.deepEqual(received.manifest.proof.commands, ['a-test', 'z-test']);
    assert.equal(received.repository.headSha, fixture.headSha);
    assert.equal(received.repository.verifiedEvidenceKeysByLane['pr-e2e'][0].checkId, 41);
    assert.equal(received.budget.version, 2);
    assert.deepEqual(received.protectedBudget, received.budget);
    assert.equal(
      received.budgetText,
      gitShow(fixture.repository, `${fixture.headSha}:scripts/repo-size-budget.json`)
    );
    assert.equal(received.protectedBudgetText, received.budgetText);
    assert.equal(
      received.baselineBudgetBytes,
      Buffer.byteLength(
        gitShow(fixture.repository, `${fixture.baselineSha}:scripts/repo-size-budget.json`)
      )
    );

    const stopped = [];
    const stoppedCode = rehearse(fixture, {
      argv: ['--manifest', manifestPath],
      cwd: fixture.repository,
      stdout: value => stopped.push(value),
      stderr: () => assert.fail('valid stopped rehearsal must not write stderr'),
      evaluate: () => ({ authorityStops: [{ code: 'dirty_outside_writer_map' }] }),
    });
    assert.equal(stoppedCode, 2);
    assert.equal(
      stopped.join(''),
      canonicalJson({
        authorityStops: [{ code: 'dirty_outside_writer_map' }],
      })
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('runSliceRehearsal exits 2 for a committed path outside the writer map', () => {
  const fixture = createRepository();
  try {
    writeFileSync(join(fixture.repository, 'outside.txt'), 'outside\n');
    git(fixture.repository, ['add', 'outside.txt']);
    git(fixture.repository, ['commit', '-q', '-m', 'outside writer']);
    const currentHeadSha = git(fixture.repository, ['rev-parse', 'HEAD']);
    const manifestPath = join(fixture.root, 'manifest.json');
    writeFileSync(manifestPath, canonicalJson(manifest(currentHeadSha)));
    const output = [];
    const errors = [];
    const exitCode = rehearse(fixture, {
      argv: ['--manifest', manifestPath],
      cwd: fixture.repository,
      readProtectedMain: () => fixture.headSha,
      stdout: value => output.push(value),
      stderr: value => errors.push(value),
    });
    assert.equal(exitCode, 2, errors.join(''));
    assert.deepEqual(errors, []);
    const report = JSON.parse(output.join(''));
    assert.ok(
      report.authorityStops.some(
        item =>
          item.code === 'repository:outside-writer-committed' && item.paths[0] === 'outside.txt'
      )
    );
    assert.equal(report.operationalEnvelope, null);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
