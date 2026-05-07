import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import packageJson from '../../package.json' with { type: 'json' };

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const auditScript = path.join(repoRoot, 'scripts/repo-size-audit.mjs');

function runAudit(args) {
  return spawnSync(process.execPath, [auditScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function runAuditFrom(cwd, args) {
  return spawnSync(process.execPath, [auditScript, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function createRepoTempDir(t) {
  const tempParent = path.join(repoRoot, 'tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(tempParent, 'repo-size-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  return tempRoot;
}

test('repo size scripts are wired into static and PR verification', () => {
  assert.equal(packageJson.scripts['repo:size'], 'node scripts/repo-size-audit.mjs');
  assert.equal(packageJson.scripts['repo:size:check'], 'node scripts/repo-size-audit.mjs --check');
  assert.match(packageJson.scripts['check:static'], /\bpnpm repo:size:check\b/u);
  assert.match(packageJson.scripts['check:all'], /\bpnpm repo:size:check\b/u);
  assert.match(packageJson.scripts['pr:verify'], /\bpnpm repo:size:check\b/u);
});

test('repo size audit emits JSON with tracked inventory and budget result', () => {
  const result = runAudit(['--check', '--json', '--top=2']);
  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.budgetResult.passed, true);
  assert.equal(report.tracked.total.files > 0, true);
  assert.equal(report.tracked.total.bytes > 0, true);
  assert.equal(report.tracked.largestFiles.length, 2);
});

test('repo size audit fails when the supplied budget is below current tracked size', t => {
  const tempRoot = createRepoTempDir(t);

  const budgetPath = path.join(tempRoot, 'repo-size-budget.json');
  fs.writeFileSync(
    budgetPath,
    `${JSON.stringify(
      {
        version: 1,
        maxTrackedBytes: 1,
        maxTrackedFiles: 1,
        maxLargestFileBytes: 1,
        maxSourceOrTestLines: 1,
        maxCategoryBytes: {
          'large support/generated-ish': 1,
          'source/scripts': 1,
          'tests/e2e': 1,
          'docs/text': 1,
          'config/data/messages': 1,
          other: 1,
        },
      },
      null,
      2
    )}\n`
  );

  const result = runAudit(['--check', `--budget=${budgetPath}`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Repo size budget failed/u);
  assert.match(result.stdout, /tracked-bytes/u);
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

  const defaultResult = runAudit(['--json', '--no-disk', '--top=5']);
  assert.equal(defaultResult.status, 0, defaultResult.stderr);
  const defaultReport = JSON.parse(defaultResult.stdout);
  assert.equal(
    defaultReport.tracked.largestFiles.some(file => file.path === untrackedRelPath),
    false
  );

  const includeResult = runAudit(['--json', '--no-disk', '--include-untracked', '--top=5']);
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

  const checkResult = runAudit(['--check', '--json']);
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
  fs.writeFileSync(
    budgetPath,
    `${JSON.stringify(
      {
        version: 1,
        maxTrackedBytes: 27262976,
        maxTrackedFiles: 3600,
        maxLargestFileBytes: 1048576,
        maxSourceOrTestLines: 3000,
        maxCategoryBytes: {
          'large support/generated-ish': 13631488,
          'source/scripts': 5767168,
          'tests/e2e': 4194304,
          'docs/text': 3145728,
          'config/data/messages': 1572864,
          other: 1048576,
        },
        accidentalSecret: 'do-not-print',
      },
      null,
      2
    )}\n`
  );

  const result = runAudit(['--check', '--json', `--budget=${budgetPath}`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported key: accidentalSecret/u);
  assert.doesNotMatch(result.stdout, /do-not-print/u);
});

test('repo size audit resolves the repository root from subdirectories', () => {
  const result = runAuditFrom(path.join(repoRoot, 'scripts'), ['--check']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Repo size budget passed/u);
});
