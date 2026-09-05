import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalJson } from './slice-rehearse-core.mjs';

const GIT = '/usr/bin/git';
const ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });

export function git(repository, args) {
  return execFileSync(GIT, args, { cwd: repository, encoding: 'utf8', env: ENV }).trim();
}

function minimalBudget(protectedMainSha) {
  const categories = Object.fromEntries(
    'config/data/messages|docs/text|large support/generated-ish|other|source/scripts|tests/e2e'
      .split('|')
      .map(category => [category, 1])
  );
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

export function createRepository(t) {
  const root = mkdtempSync(join(tmpdir(), 'slice-rehearse-cli-safety-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
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

export function manifest(baseSha) {
  const path = 'declared.txt';
  const proof = {
    commands: ['node --test'],
    heavyLanes: [],
    fullGateRequired: false,
    workflowDigest: 'a'.repeat(64),
    substrateDigest: 'b'.repeat(64),
  };
  return {
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
    topology: Object.freeze({
      closeoutMode: 'none',
      projectionPaths: [],
      repairPaths: [],
      repairAllocationId: null,
    }),
  };
}
