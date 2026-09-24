import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import packageJson from '../../package.json' with { type: 'json' };
import { allocationBudget } from './repo-size-capacity-fixtures.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const auditScript = path.join(repoRoot, 'scripts/repo-size-audit.mjs');
const categories = [
  'large support/generated-ish',
  'source/scripts',
  'tests/e2e',
  'docs/text',
  'config/data/messages',
  'other',
];

function runAudit(args, cwd = repoRoot) {
  return spawnSync(process.execPath, [auditScript, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function createRepoTempDir(t) {
  const tempParent = path.join(repoRoot, 'tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(tempParent, 'repo-size-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  return tempRoot;
}

function writeBudget(file, max = 1e9, extra = {}) {
  const maxCategoryBytes = Object.fromEntries(categories.map(name => [name, max]));
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      maxTrackedBytes: max,
      maxTrackedFiles: max,
      maxLargestFileBytes: max,
      maxSourceOrTestLines: max,
      maxCategoryBytes,
      ...extra,
    })
  );
}

function createPassingBudget(t) {
  const budgetPath = path.join(createRepoTempDir(t), 'repo-size-budget.json');
  writeBudget(budgetPath);
  return budgetPath;
}

test('repo size scripts are wired into static and PR verification', () => {
  assert.equal(packageJson.scripts['repo:size'], 'node scripts/repo-size-audit.mjs');
  assert.equal(packageJson.scripts['repo:size:check'], 'node scripts/repo-size-audit.mjs --check');
  assert.match(packageJson.scripts['check:static'], /\bpnpm repo:size:check\b/u);
  assert.match(packageJson.scripts['check:all'], /\bpnpm repo:size:check\b/u);
  assert.match(packageJson.scripts['pr:verify'], /\bpnpm repo:size:check\b/u);
});

test('pre-push repo-size check evaluates each pushed commit in an isolated worktree', () => {
  const hook = fs.readFileSync(path.join(repoRoot, '.husky/pre-push'), 'utf8');
  assert.match(hook, /while read -r _local_ref local_sha _remote_ref _remote_sha/u);
  assert.match(hook, /checkout="\$scratch\/checkout"/u);
  assert.match(hook, /worktree add --quiet --detach "\$checkout" "\$local_sha"/u);
  assert.match(hook, /cd "\$checkout" && node scripts\/repo-size-audit\.mjs --check/u);
  assert.doesNotMatch(hook, /pnpm repo:size:check/u);
});

test('repo size audit emits JSON with tracked inventory and budget result', t => {
  const budgetPath = createPassingBudget(t);
  const result = runAudit(['--check', '--json', '--top=2', `--budget=${budgetPath}`]);
  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.budgetResult.passed, true);
  assert.equal(report.tracked.total.files > 0, true);
  assert.equal(report.tracked.total.bytes > 0, true);
  assert.equal(report.tracked.largestFiles.length, 2);
  assert.equal(typeof report.tracked.largestCapacityFile?.path, 'string');
  assert.equal(report.tracked.largestCapacityFile.bytes > 0, true);
  assert.equal(
    ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'].includes(
      report.tracked.largestCapacityFile.path
    ),
    false
  );
});

test('repo size audit retains the oversized-file limit', t => {
  const tempRoot = createRepoTempDir(t);

  const budgetPath = path.join(tempRoot, 'repo-size-budget.json');
  writeBudget(budgetPath, 1);

  const result = runAudit(['--check', `--budget=${budgetPath}`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Repo size budget failed/u);
  assert.match(result.stdout, /largest-file-bytes/u);
});

function git(root, ...args) {
  const result = spawnSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function ordinaryFixture(t) {
  const root = createRepoTempDir(t);
  git(root, 'init', '--quiet');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  const budget = { ...allocationBudget(), maxLargestFileBytes: 100_000 };
  const budgetPath = path.join(root, 'scripts/repo-size-budget.json');
  fs.writeFileSync(budgetPath, JSON.stringify(budget));
  fs.writeFileSync(path.join(root, 'scripts/lean.mjs'), 'export const value = 1;\n');
  fs.writeFileSync(path.join(root, 'old.ts'), 'export {};\n');
  git(root, 'add', '.');
  git(
    root,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '-qm',
    'fixture'
  );
  return { root, budget, budgetPath };
}

test('ordinary source, test and catalog edits pass without allocations or baseline history', t => {
  const { root, budgetPath } = ordinaryFixture(t);
  const originalBudget = fs.readFileSync(budgetPath, 'utf8');
  // The historical baseline is deliberately absent, and an allocated path changes too.
  fs.writeFileSync(path.join(root, 'scripts/lean.mjs'), '// routine source\n'.repeat(1100));
  fs.writeFileSync(path.join(root, 'new.test.mjs'), '// focused regression\n'.repeat(100));
  fs.writeFileSync(path.join(root, 'en.json'), JSON.stringify({ message: 'Updated copy' }));
  git(root, 'mv', 'old.ts', 'renamed.ts');
  git(root, 'add', '.');

  const result = runAudit(['--check', '--json'], root);
  assert.equal(result.status, 0, result.stderr);
  const { budgetResult } = JSON.parse(result.stdout);
  assert.equal(budgetResult.passed, true);
  assert.deepEqual(budgetResult.violations, []);
  for (const code of ['tracked-bytes', 'source-or-test-lines', 'category:source/scripts']) {
    assert.ok(
      budgetResult.advisories.some(item => item.code === code),
      code
    );
  }
  git(root, 'rm', '-f', 'renamed.ts');
  const deletion = runAudit(['--check'], root);
  assert.equal(deletion.status, 0, deletion.stderr);
  assert.match(deletion.stdout, /advisory/iu);
  assert.equal(fs.readFileSync(budgetPath, 'utf8'), originalBudget);
});

test('ordinary checking rejects an oversized artifact hidden by a larger canonical document', t => {
  const { root, budget, budgetPath } = ordinaryFixture(t);
  const originalBudget = fs.readFileSync(budgetPath, 'utf8');
  fs.mkdirSync(path.join(root, 'docs/plans'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/plans/current-program.md'), 'x'.repeat(200_000));
  fs.writeFileSync(path.join(root, 'accidental.zip'), Buffer.alloc(budget.maxLargestFileBytes + 1));
  git(root, 'add', '.');
  const result = runAudit(['--check', '--json', '--top=1'], root);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.tracked.largestFiles[0].path, 'docs/plans/current-program.md');
  assert.equal(report.budgetResult.passed, false);
  assert.ok(
    report.budgetResult.violations.some(
      item => item.code === 'largest-file-bytes' && item.path === 'accidental.zip'
    )
  );
  assert.equal(fs.readFileSync(budgetPath, 'utf8'), originalBudget);
});

test('repo size audit rejects budget paths outside the repository', () => {
  const outsideBudgetPath = path.resolve(repoRoot, '..', 'repo-size-budget.json');
  const result = runAudit(['--check', `--budget=${outsideBudgetPath}`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /budget path must stay inside the repository/u);
});

test('repo size check excludes untracked files while report mode can include them', t => {
  const untrackedPath = path.join(repoRoot, '.repo-size-untracked-large.txt');
  const untrackedRelPath = path.relative(repoRoot, untrackedPath);
  const untrackedBytes = 1_100_000;
  fs.writeFileSync(untrackedPath, 'x'.repeat(untrackedBytes));
  t.after(() => fs.rmSync(untrackedPath, { force: true }));

  const defaultResult = runAudit(['--json', '--no-disk', '--top=50']);
  assert.equal(defaultResult.status, 0, defaultResult.stderr);
  const defaultReport = JSON.parse(defaultResult.stdout);
  assert.equal(
    defaultReport.tracked.largestFiles.some(file => file.path === untrackedRelPath),
    false
  );

  const includeResult = runAudit(['--json', '--no-disk', '--include-untracked', '--top=50']);
  assert.equal(includeResult.status, 0, includeResult.stderr);
  const includeReport = JSON.parse(includeResult.stdout);
  assert.equal(
    includeReport.tracked.largestFiles.some(file => file.path === untrackedRelPath),
    true
  );
  assert.equal(
    includeReport.tracked.total.bytes >= defaultReport.tracked.total.bytes + untrackedBytes,
    true
  );

  const budgetPath = createPassingBudget(t);
  const checkResult = runAudit(['--check', '--json', `--budget=${budgetPath}`]);
  assert.equal(checkResult.status, 0, checkResult.stderr);
  assert.equal(JSON.parse(checkResult.stdout).options.includeUntracked, false);
});

test('repo size audit does not over-count a trailing newline as an extra source line', t => {
  const untrackedPath = path.join(repoRoot, '.repo-size-line-count.js');
  const untrackedRelPath = path.relative(repoRoot, untrackedPath);
  fs.writeFileSync(
    untrackedPath,
    ['const a = 1;', 'const b = 2;', 'const c = 3;', 'const d = 4;'].join('\n') + '\n'
  );
  t.after(() => fs.rmSync(untrackedPath, { force: true }));

  const belowThresholdResult = runAudit([
    '--json',
    '--no-disk',
    '--include-untracked',
    '--min-lines=5',
    '--top=5000',
  ]);
  assert.equal(belowThresholdResult.status, 0, belowThresholdResult.stderr);
  const belowThresholdReport = JSON.parse(belowThresholdResult.stdout);
  assert.equal(
    belowThresholdReport.tracked.sourceHotspots.some(file => file.path === untrackedRelPath),
    false
  );

  const atThresholdResult = runAudit([
    '--json',
    '--no-disk',
    '--include-untracked',
    '--min-lines=4',
    '--top=5000',
  ]);
  assert.equal(atThresholdResult.status, 0, atThresholdResult.stderr);
  const atThresholdReport = JSON.parse(atThresholdResult.stdout);
  const hotspot = atThresholdReport.tracked.sourceHotspots.find(
    file => file.path === untrackedRelPath
  );
  assert.equal(hotspot?.lines, 4);
});

test('repo size audit rejects unsupported budget keys before JSON echo', t => {
  const tempRoot = createRepoTempDir(t);
  const budgetPath = path.join(tempRoot, 'repo-size-budget.json');
  writeBudget(budgetPath, 30_000_000, { accidentalSecret: 'do-not-print' });

  const result = runAudit(['--check', '--json', `--budget=${budgetPath}`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported key: accidentalSecret/u);
  assert.doesNotMatch(result.stdout, /do-not-print/u);
});

test('repo size audit resolves the repository root from subdirectories', t => {
  const budgetPath = createPassingBudget(t);
  const result = runAudit(['--check', `--budget=${budgetPath}`], path.join(repoRoot, 'scripts'));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Repo size budget passed/u);
});
