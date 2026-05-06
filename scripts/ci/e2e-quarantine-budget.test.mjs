import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const budgetScript = path.join(rootDir, 'scripts/check-e2e-quarantine-budget.mjs');

function readRepoJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-e2e-budget-'));
}

function writeFixture(tempRoot, relativePath, lines) {
  const fixturePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, `${lines.join('\n')}\n`);
}

function runBudget(tempRoot, extraArgs = []) {
  return spawnSync(
    process.execPath,
    [
      budgetScript,
      '--root=apps/web/e2e',
      '--baseline=apps/web/e2e/quarantine/baseline.json',
      '--report=tmp/e2e-budget-report.json',
      ...extraArgs,
    ],
    {
      cwd: tempRoot,
      encoding: 'utf8',
    }
  );
}

function readJson(tempRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(tempRoot, relativePath), 'utf8'));
}

function createBudgetFixture(t, lines, relativePath = 'apps/web/e2e/example.spec.ts') {
  const tempRoot = createTempRepo();
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  writeFixture(tempRoot, relativePath, lines);

  const baselineResult = runBudget(tempRoot, ['--write-baseline']);
  assert.equal(baselineResult.status, 0, baselineResult.stderr);

  return tempRoot;
}

test('E2E quarantine budget is wired into contract checks and PR verification', () => {
  const packageJson = readRepoJson('package.json');
  const baseline = readRepoJson('apps/web/e2e/quarantine/baseline.json');

  assert.equal(
    packageJson.scripts['check:e2e-quarantine-budget'],
    'node scripts/check-e2e-quarantine-budget.mjs'
  );
  assert.equal(
    packageJson.scripts['check:e2e-contracts:base'],
    'node scripts/check-e2e-contracts.mjs'
  );
  assert.match(packageJson.scripts['check:e2e-contracts'], /pnpm check:e2e-quarantine-budget/u);
  assert.match(packageJson.scripts['pr:verify'], /pnpm check:e2e-contracts/u);
  assert.equal(baseline.version, 1);
  assert.equal(baseline.tags.quarantine.count, 6);
  assert.equal(baseline.tags.legacy.count, 2);
});

test('E2E quarantine budget passes when quarantine and legacy inventory is unchanged', t => {
  const tempRoot = createBudgetFixture(t, [
    "test.describe('@quarantine Known unstable surface', () => {});",
    "test.describe('@legacy Historical flow', () => {});",
  ]);

  const passingResult = runBudget(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
  assert.match(passingResult.stdout, /quarantine=1 legacy=1/u);

  const trimmedRootResult = runBudget(tempRoot, ['--root= apps/web/e2e ']);
  assert.equal(trimmedRootResult.status, 0, trimmedRootResult.stderr);
});

test('E2E quarantine budget rejects empty path options', t => {
  const tempRoot = createBudgetFixture(t, [
    "test.describe('@quarantine Known unstable surface', () => {});",
  ]);

  const failingResult = runBudget(tempRoot, ['--root=   ']);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stderr, /--root requires a non-empty value/u);
});

test('E2E quarantine budget fails when a new quarantine marker is added', t => {
  const tempRoot = createBudgetFixture(t, [
    "test.describe('@quarantine Known unstable surface', () => {});",
  ]);

  writeFixture(tempRoot, 'apps/web/e2e/new-flake.spec.ts', [
    "test('@quarantine Newly hidden flaky flow', async () => {});",
  ]);

  const failingResult = runBudget(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stderr, /Added @quarantine markers \(1\)/u);
  assert.match(failingResult.stderr, /new-flake\.spec\.ts:1/u);
});

test('E2E quarantine budget fails when baseline metadata is inconsistent', t => {
  const tempRoot = createBudgetFixture(t, [
    "test.describe('@quarantine Known unstable surface', () => {});",
  ]);

  const baselinePath = path.join(tempRoot, 'apps/web/e2e/quarantine/baseline.json');
  const baseline = readJson(tempRoot, 'apps/web/e2e/quarantine/baseline.json');
  baseline.tags.quarantine.count = 99;
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);

  const failingResult = runBudget(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stderr, /count=99 does not match markers=1/u);
});

test('E2E quarantine budget passes after an intentional burn-down updates the baseline', t => {
  const tempRoot = createBudgetFixture(t, [
    "test.describe('@quarantine Known unstable surface', () => {});",
    "test('@quarantine Second known unstable surface', async () => {});",
  ]);

  writeFixture(tempRoot, 'apps/web/e2e/example.spec.ts', [
    "test.describe('@quarantine Known unstable surface', () => {});",
  ]);
  const updatedBaseline = runBudget(tempRoot, ['--write-baseline']);
  assert.equal(updatedBaseline.status, 0, updatedBaseline.stderr);

  const passingResult = runBudget(tempRoot);
  assert.equal(passingResult.status, 0, passingResult.stderr);
  const baseline = readJson(tempRoot, 'apps/web/e2e/quarantine/baseline.json');
  assert.equal(baseline.tags.quarantine.count, 1);
});

test('E2E quarantine budget fails when quarantine is renamed sideways to legacy', t => {
  const tempRoot = createBudgetFixture(t, [
    "test.describe('@quarantine Known unstable surface', () => {});",
  ]);

  writeFixture(tempRoot, 'apps/web/e2e/example.spec.ts', [
    "test.describe('@legacy Known unstable surface', () => {});",
  ]);

  const failingResult = runBudget(tempRoot);
  assert.equal(failingResult.status, 1);
  assert.match(failingResult.stderr, /Added @legacy markers \(1\)/u);
  assert.match(failingResult.stderr, /Removed or moved @quarantine markers \(1\)/u);
});
