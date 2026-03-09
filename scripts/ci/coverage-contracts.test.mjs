import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import packageJson from '../../package.json' with { type: 'json' };

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');
const coverageGateModuleUrl = pathToFileURL(path.join(rootDir, 'scripts/ci/coverage-gate.mjs')).href;

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

  const { runCoverageGate } = await import(coverageGateModuleUrl);
  const result = runCoverageGate({
    rootDir: tempRoot,
    minLinesPct: 60,
    stdout: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.summaryFiles.length, 2);
  assert.equal(result.aggregate.covered, 135);
  assert.equal(result.aggregate.total, 200);
  assert.equal(result.aggregate.pct, 67.5);
});

test('coverage gate script fails when aggregate line coverage drops below the configured floor', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gate-fail-'));
  writeCoverageSummary(tempRoot, 'apps/web', 50, 100);
  writeCoverageSummary(tempRoot, 'packages/domain-ai', 69, 100);

  const { runCoverageGate } = await import(coverageGateModuleUrl);
  const result = runCoverageGate({
    rootDir: tempRoot,
    minLinesPct: 60,
    stdout: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.aggregate.covered, 119);
  assert.equal(result.aggregate.total, 200);
  assert.equal(result.aggregate.pct, 59.5);
});

test('coverage scripts and canonical PR verification wire the blocking repository floor', () => {
  assert.match(packageJson.scripts['test:coverage'], /scripts\/ci\/clean-coverage-artifacts\.mjs/);
  assert.match(packageJson.scripts['test:coverage'], /--coverage\.reporter=json-summary/);
  assert.equal(
    packageJson.scripts['coverage:gate'],
    'pnpm test:coverage && node scripts/ci/coverage-gate.mjs --min-lines 60'
  );
  assert.match(packageJson.scripts['pr:verify'], /\bpnpm coverage:gate\b/);
});
