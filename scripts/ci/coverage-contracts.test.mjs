import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import packageJson from '../../package.json' with { type: 'json' };

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const coverageGateModuleUrl = pathToFileURL(
  path.join(rootDir, 'scripts/ci/coverage-gate.mjs')
).href;
const coverageCleanerModuleUrl = pathToFileURL(
  path.join(rootDir, 'scripts/ci/clean-coverage-artifacts.mjs')
).href;

function writeCoverageSummary(rootPath, relativePath, covered, total) {
  const summaryPath = path.join(rootPath, relativePath, 'coverage', 'coverage-summary.json');
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(
    summaryPath,
    JSON.stringify({
      total: {
        lines: {
          total,
          covered,
          skipped: 0,
          pct: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)),
        },
      },
    })
  );
}

test('coverage gate script aggregates workspace line coverage and passes at the 60 percent floor', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gate-pass-'));
  writeCoverageSummary(tempRoot, 'apps/web', 60, 100);
  writeCoverageSummary(tempRoot, 'packages/domain-ai', 75, 100);
  writeCoverageSummary(tempRoot, 'packages/shared-auth', 90, 100);

  const { runCoverageGate } = await import(coverageGateModuleUrl);
  const result = runCoverageGate({
    rootDir: tempRoot,
    minLinesPct: 60,
    stdout: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summaryFiles.length, 3);
  assert.deepEqual(
    result.workspaces.map(workspace => workspace.label),
    ['apps/web', 'packages/domain-ai', 'packages/shared-auth']
  );
  assert.equal(result.aggregate.covered, 225);
  assert.equal(result.aggregate.total, 300);
  assert.equal(result.aggregate.pct, 75);
});

test('coverage gate script fails when aggregate line coverage drops below the configured floor', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gate-fail-'));
  writeCoverageSummary(tempRoot, 'apps/web', 50, 100);
  writeCoverageSummary(tempRoot, 'packages/domain-ai', 69, 100);
  writeCoverageSummary(tempRoot, 'packages/shared-auth', 60, 100);

  const { runCoverageGate } = await import(coverageGateModuleUrl);
  const result = runCoverageGate({
    rootDir: tempRoot,
    minLinesPct: 60,
    stdout: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.aggregate.covered, 179);
  assert.equal(result.aggregate.total, 300);
  assert.equal(result.aggregate.pct, 59.67);
});

test('coverage gate fails closed when a required summary is missing or malformed', async () => {
  const { runCoverageGate } = await import(coverageGateModuleUrl);
  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gate-missing-auth-'));
  writeCoverageSummary(missingRoot, 'apps/web', 60, 100);
  assert.throws(() => runCoverageGate({ rootDir: missingRoot, stdout: false }), /shared-auth/);

  const missingWebRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gate-missing-web-'));
  writeCoverageSummary(missingWebRoot, 'packages/shared-auth', 60, 100);
  assert.throws(() => runCoverageGate({ rootDir: missingWebRoot, stdout: false }), /apps\/web/);

  const malformedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gate-bad-auth-'));
  writeCoverageSummary(malformedRoot, 'apps/web', 60, 100);
  const malformed = path.join(malformedRoot, 'packages/shared-auth/coverage/coverage-summary.json');
  fs.mkdirSync(path.dirname(malformed), { recursive: true });
  fs.writeFileSync(malformed, '{not-json');
  assert.throws(() => runCoverageGate({ rootDir: malformedRoot, stdout: false }), SyntaxError);

  fs.writeFileSync(malformed, JSON.stringify({ total: { lines: { total: '81', covered: null } } }));
  assert.throws(
    () => runCoverageGate({ rootDir: malformedRoot, stdout: false }),
    /missing total line data/
  );

  writeCoverageSummary(malformedRoot, 'packages/shared-auth', 0, 0);
  assert.throws(
    () => runCoverageGate({ rootDir: malformedRoot, stdout: false }),
    /zero total lines/
  );
});

test('coverage cleaner removes stale shared-auth output before collection', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-clean-auth-'));
  writeCoverageSummary(tempRoot, 'packages/shared-auth', 100, 100);
  const staleSummary = path.join(tempRoot, 'packages/shared-auth/coverage/coverage-summary.json');
  fs.mkdirSync(path.join(tempRoot, 'apps/web'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'packages/domain-ai'), { recursive: true });

  const { cleanCoverageArtifacts } = await import(coverageCleanerModuleUrl);
  cleanCoverageArtifacts({ rootDir: tempRoot });

  assert.equal(fs.existsSync(staleSummary), false);
  assert.equal(fs.existsSync(path.join(tempRoot, 'packages/shared-auth/coverage/.tmp')), true);
});

test('coverage scripts and canonical PR verification wire the blocking repository floor', () => {
  assert.match(packageJson.scripts['test:coverage'], /scripts\/ci\/clean-coverage-artifacts\.mjs/);
  assert.match(
    packageJson.scripts['test:coverage'],
    /pnpm --filter @interdomestik\/web exec vitest run --coverage --pool=threads --maxWorkers=25% --testTimeout=10000/
  );
  assert.match(packageJson.scripts['test:coverage'], /--coverage\.reporter=json-summary/);
  const sharedAuthRuns = packageJson.scripts['test:coverage'].match(
    /pnpm --filter @interdomestik\/shared-auth[^&]+--coverage[^&]+--coverage\.reporter=json-summary/g
  );
  assert.equal(sharedAuthRuns?.length, 1);
  assert.ok(
    packageJson.scripts['test:coverage'].indexOf('clean-coverage-artifacts.mjs') <
      packageJson.scripts['test:coverage'].indexOf('--filter @interdomestik/web')
  );
  for (const reporter of ['text', 'json', 'html', 'lcov', 'json-summary']) {
    assert.match(sharedAuthRuns[0], new RegExp(`--coverage\\.reporter=${reporter}(?:\\s|$)`));
  }
  assert.equal(
    packageJson.scripts['coverage:gate'],
    'pnpm test:coverage && node scripts/ci/coverage-gate.mjs --min-lines 60'
  );
  assert.match(packageJson.scripts['pr:verify'], /\bpnpm coverage:gate\b/);
  assert.match(packageJson.scripts['pr:verify'], /\bpnpm check:e2e-contracts\b/);
  assert.match(packageJson.scripts['pr:verify'], /\bpnpm lint:production-warnings\b/);
});
