import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'testing-agent-analyze.mjs');

function runAnalyzer(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function makeTestEntry(status) {
  if (status === 'pass') {
    return {
      projectName: 'gate-ks-sq',
      status: 'expected',
      expectedStatus: 'passed',
      results: [{ status: 'passed' }],
    };
  }

  return {
    projectName: 'gate-ks-sq',
    status: 'unexpected',
    expectedStatus: 'passed',
    results: [{ status: 'failed' }],
  };
}

function makeReport({ rootDir, specs }) {
  return {
    config: { rootDir },
    stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 0, duration: 1 },
    errors: [],
    suites: [
      {
        title: 'suite',
        specs,
        suites: [],
      },
    ],
  };
}

test('fails when a required option value is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testing-agent-analyze-args-'));
  const result = runAnalyzer(['--reports-dir', '--out-json', 'x.json', '--out-md', 'x.md'], tmpDir);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing value for --reports-dir/);
});

test('rewrites only safe in-repo flaky files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testing-agent-analyze-rewrite-'));
  const repoRoot = path.join(tmpDir, 'repo');
  const e2eDir = path.join(repoRoot, 'apps/web/e2e');
  const reportsDir = path.join(tmpDir, 'reports');
  const outJson = path.join(tmpDir, 'out/summary.json');
  const outMd = path.join(tmpDir, 'out/summary.md');
  const rewriteSummaryOut = path.join(tmpDir, 'out/rewrite.json');

  fs.mkdirSync(path.join(e2eDir, 'utils'), { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(e2eDir, 'utils/deterministic-waits.ts'), '// helper\n', 'utf8');

  const safeSpec = path.join(e2eDir, 'safe.spec.ts');
  const outsideSpec = path.join(tmpDir, 'outside.spec.ts');

  fs.writeFileSync(
    safeSpec,
    [
      "import { test } from '@playwright/test';",
      '',
      "test('safe', async ({ page }) => {",
      '  await page.waitForTimeout(1000);',
      '});',
      '',
    ].join('\n'),
    'utf8'
  );

  fs.writeFileSync(
    outsideSpec,
    [
      "import { test } from '@playwright/test';",
      '',
      "test('outside', async ({ page }) => {",
      '  await page.waitForTimeout(2000);',
      '});',
      '',
    ].join('\n'),
    'utf8'
  );

  const runOneReport = makeReport({
    rootDir: e2eDir,
    specs: [
      {
        file: safeSpec,
        title: 'safe flaky test',
        tests: [makeTestEntry('fail')],
      },
      {
        file: outsideSpec,
        title: 'outside flaky test',
        tests: [makeTestEntry('fail')],
      },
    ],
  });

  const runTwoReport = makeReport({
    rootDir: e2eDir,
    specs: [
      {
        file: safeSpec,
        title: 'safe flaky test',
        tests: [makeTestEntry('pass')],
      },
      {
        file: outsideSpec,
        title: 'outside flaky test',
        tests: [makeTestEntry('pass')],
      },
    ],
  });

  fs.writeFileSync(
    path.join(reportsDir, 'run-01.report.json'),
    JSON.stringify(runOneReport, null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(reportsDir, 'run-02.report.json'),
    JSON.stringify(runTwoReport, null, 2),
    'utf8'
  );

  const result = runAnalyzer(
    [
      '--reports-dir',
      reportsDir,
      '--out-json',
      outJson,
      '--out-md',
      outMd,
      '--repo-root',
      repoRoot,
      '--rewrite',
      '--rewrite-summary-out',
      rewriteSummaryOut,
    ],
    repoRoot
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const safeContent = fs.readFileSync(safeSpec, 'utf8');
  const outsideContent = fs.readFileSync(outsideSpec, 'utf8');
  const summary = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  const rewriteSummary = JSON.parse(fs.readFileSync(rewriteSummaryOut, 'utf8'));

  assert.match(safeContent, /waitForAnyReadyMarker/);
  assert.match(safeContent, /from '\.\/utils\/deterministic-waits';/);
  assert.match(outsideContent, /\.waitForTimeout\(2000\)/);

  assert.equal(rewriteSummary.changedFiles.length, 1);
  assert.equal(
    rewriteSummary.changedFiles[0].file.replace(/\\/g, '/'),
    safeSpec.replace(/\\/g, '/')
  );
  assert.equal(summary.totals.flakyTests, 2);
  assert(summary.flakyTests.some(entry => entry.fileRel === 'apps/web/e2e/__unknown__.spec.ts'));
});
