import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const rootDir = path.resolve(new URL('../../', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const { SUITES } = require('../release-gate/config.ts');
const { structuredArtifactOwner } = await import('../modularity-guard-policy.mjs');
const workflowSource = fs.readFileSync(
  path.join(rootDir, '.github/workflows/release-candidate.yml'),
  'utf8'
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('release candidate executes the complete release scenario set once', () => {
  const releaseCommands = workflowSource.match(/release:gate:(?:p0:raw|p1:raw|raw)/gu) ?? [];

  assert.deepEqual(releaseCommands, ['release:gate:raw']);
  assert.match(
    workflowSource,
    /name: RC release-gate suite - all[\s\S]*release:gate:raw --suite all/u
  );
  assert.doesNotMatch(workflowSource, /name: RC release-gate suite - p[01]/u);

  const componentSelections = [...SUITES.p0, ...SUITES.p1, ...SUITES.p6];
  assert.equal(componentSelections.length, 13);
  assert.equal(new Set(componentSelections).size, 13);
  assert.deepEqual(SUITES.all, componentSelections);
});

test('release candidate reuses stronger RLS proof from pr:verify:hosts', () => {
  const manifest = readJson('scripts/release-gate/v1-required-specs.json');
  const packageJson = readJson('package.json');
  const hostVerifier = readText('scripts/pr-verify-hosts.sh');

  assert.doesNotMatch(workflowSource, /name: RC check - RLS integration/u);
  assert.equal(manifest.required.commands.rls, undefined);
  assert.equal(manifest.required.commands.pr_verify_hosts, 'pnpm pr:verify:hosts');
  assert.equal(packageJson.scripts['pr:verify:hosts'], 'bash scripts/pr-verify-hosts.sh');
  assert.match(hostVerifier, /^pnpm pr:verify$/mu);
  assert.match(packageJson.scripts['pr:verify'], /pnpm db:rls:test:required/u);
  assert.match(packageJson.scripts['db:rls:test:required'], /REQUIRE_RLS_INTEGRATION=1/u);
  assert.match(packageJson.scripts['db:rls:test:required'], /REQUIRE_RLS_COVERAGE=1/u);
  assert.equal(
    structuredArtifactOwner('scripts/release-gate/v1-required-specs.json'),
    'release-candidate-required-specs-contract'
  );
});

test('RC artifact consumers do not require removed component-suite logs', () => {
  const consumerSource = [
    'scripts/release-gate/write-rc-manifest.mjs',
    'scripts/release-gate/streak/capture-streak.mjs',
    'scripts/release-gate/verify-required-specs.mjs',
  ]
    .map(readText)
    .join('\n');

  assert.doesNotMatch(consumerSource, /release-gate-p0\.log|release-gate-p1\.log/u);
});

test('RC manifest retains embedded RLS evidence and Playwright artifacts', () => {
  const tmpParent = path.join(rootDir, 'tmp');
  fs.mkdirSync(tmpParent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(tmpParent, 'rc-dedup-contract-'));

  try {
    const manifestPath = path.join(fixtureRoot, 'required.json');
    const logsDir = path.join(fixtureRoot, 'logs');
    const resultsDir = path.join(fixtureRoot, 'results');
    const outputPath = path.join(fixtureRoot, 'rc.json');
    fs.mkdirSync(logsDir);
    fs.mkdirSync(resultsDir);
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({ required: { commands: { pr_verify_hosts: 'pnpm pr:verify:hosts' } } })}\n`
    );
    fs.writeFileSync(path.join(logsDir, 'pr_verify_hosts.exit'), '0\n');
    fs.writeFileSync(
      path.join(logsDir, 'pr_verify_hosts.log'),
      'required RLS coverage passed\nRLS_INTEGRATION_RAN=1\n'
    );
    fs.writeFileSync(path.join(resultsDir, 'report.json'), '{}\n');
    fs.writeFileSync(path.join(resultsDir, 'junit.xml'), '<testsuites/>\n');

    execFileSync(
      process.execPath,
      [
        'scripts/release-gate/write-rc-manifest.mjs',
        '--manifest',
        path.relative(rootDir, manifestPath),
        '--run-id',
        'dedup-contract',
        '--results-dir',
        path.relative(rootDir, resultsDir),
        '--logs-dir',
        path.relative(rootDir, logsDir),
        '--out',
        path.relative(rootDir, outputPath),
      ],
      { cwd: rootDir }
    );

    const receipt = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(receipt.commands.pr_verify_hosts.exit_code, 0);
    assert.equal(receipt.commands.rls, undefined);
    assert.equal(receipt.checks.rls_integration_ran, true);
    assert.equal(
      receipt.artifacts.report_json,
      path.relative(rootDir, path.join(resultsDir, 'report.json'))
    );
    assert.equal(
      receipt.artifacts.junit_xml,
      path.relative(rootDir, path.join(resultsDir, 'junit.xml'))
    );
    assert.equal(fs.existsSync(`${outputPath}.sha256`), true);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('required Playwright run remains because it owns the verifier artifacts', () => {
  const playwrightIndex = workflowSource.indexOf('name: RC check - required Playwright gate suite');
  const verifierIndex = workflowSource.indexOf('name: RC check - required-suite verifier');

  assert.ok(playwrightIndex >= 0);
  assert.ok(verifierIndex > playwrightIndex);
  assert.match(
    workflowSource,
    /playwright test e2e\/gate --project=gate-ks-sq --project=gate-mk-mk/u
  );
  assert.match(workflowSource, /--playwright-json "\$\{RC_RESULTS_DIR\}\/report\.json"/u);
  assert.match(workflowSource, /--junit "\$\{RC_RESULTS_DIR\}\/junit\.xml"/u);
});
