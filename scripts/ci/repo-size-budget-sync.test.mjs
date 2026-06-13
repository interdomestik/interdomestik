import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { stableJson, synchronizedBudget } from '../repo-size-budget-sync-core.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const syncScript = path.join(repoRoot, 'scripts/repo-size-budget-sync.mjs');
const auditScript = path.join(repoRoot, 'scripts/repo-size-audit.mjs');

function runSync(args) {
  return spawnSync(process.execPath, [syncScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function trackedBytes() {
  const result = spawnSync(
    process.execPath,
    [auditScript, '--json', '--no-disk', '--min-lines=0', '--top=1'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).tracked.total.bytes;
}

function createTempBudget(t, budget) {
  const tempParent = path.join(repoRoot, 'tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(tempParent, 'repo-size-sync-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const budgetPath = path.join(tempRoot, 'repo-size-budget.json');
  fs.writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);
  return budgetPath;
}

function staleBudget() {
  return {
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
  };
}

function syntheticReport(bytes) {
  const sourceBytes = 1;

  return {
    tracked: {
      categories: [
        { name: 'config/data/messages', bytes },
        { name: 'source/scripts', bytes: sourceBytes },
      ],
      largestFiles: [{ bytes: 1 }],
      sourceHotspots: [{ lines: 1 }],
      total: { bytes: bytes + sourceBytes, files: 1 },
    },
  };
}

test('repo size sync detects drift, updates the budget, then passes check mode', t => {
  const budgetPath = createTempBudget(t, staleBudget());

  const driftResult = runSync(['--tracked-only', '--check', `--budget=${budgetPath}`]);
  assert.equal(driftResult.status, 1);
  assert.match(driftResult.stdout, /Repo size budget drift/u);

  const updateResult = runSync(['--tracked-only', `--budget=${budgetPath}`]);
  assert.equal(updateResult.status, 0, updateResult.stderr);
  assert.match(updateResult.stdout, /Repo size budget drift/u);

  const updatedBudget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
  assert.equal(updatedBudget.maxTrackedBytes > 1, true);
  assert.equal(updatedBudget.maxTrackedFiles > 1, true);
  assert.equal(Object.keys(updatedBudget.maxCategoryBytes).length > 0, true);

  const cleanResult = runSync(['--tracked-only', '--check', `--budget=${budgetPath}`]);
  assert.equal(cleanResult.status, 0, cleanResult.stderr);
  assert.match(cleanResult.stdout, /already synchronized/u);
});

test('repo size sync dry run reports drift without writing the budget', t => {
  const originalBudget = staleBudget();
  const budgetPath = createTempBudget(t, originalBudget);

  const result = runSync(['--tracked-only', '--dry-run', `--budget=${budgetPath}`]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Repo size budget drift/u);
  assert.deepEqual(JSON.parse(fs.readFileSync(budgetPath, 'utf8')), originalBudget);
});

test('repo size sync accounts for the budget file write when audited', () => {
  const budgetPath = '.repo-size-sync-budget.json';
  const previousBudget = staleBudget();
  const previousText = stableJson(previousBudget);
  const beforeReport = syntheticReport(Buffer.byteLength(previousText));
  const nextBudget = synchronizedBudget(
    beforeReport,
    previousBudget,
    budgetPath,
    previousText,
    true
  );
  const nextText = stableJson(nextBudget);
  const afterReport = syntheticReport(Buffer.byteLength(nextText));

  assert.equal(
    stableJson(synchronizedBudget(afterReport, nextBudget, budgetPath, nextText, true)),
    nextText
  );
});

test('repo size sync includes non-ignored untracked files before staging', t => {
  const untrackedPath = path.join(repoRoot, '.repo-size-sync-untracked.js');
  const untrackedBytes = 321;
  fs.writeFileSync(untrackedPath, 'x'.repeat(untrackedBytes));
  t.after(() => fs.rmSync(untrackedPath, { force: true }));

  const budgetPath = createTempBudget(t, staleBudget());
  const result = runSync([`--budget=${budgetPath}`]);
  assert.equal(result.status, 0, result.stderr);

  const syncedBudget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
  assert.equal(syncedBudget.maxTrackedBytes >= trackedBytes() + untrackedBytes, true);
});

test('repo size sync rejects an empty budget path clearly', () => {
  const result = runSync(['--budget=']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--budget requires a non-empty value/u);
});
