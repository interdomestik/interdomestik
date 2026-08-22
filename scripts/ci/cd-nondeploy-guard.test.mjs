import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  assertNoCompetingRuns,
  classifyScope,
  parseScopeManifest,
  readPushEvidence,
  runGuard,
} from './cd-nondeploy-guard.mjs';
const sha = character => character.repeat(40);
const manifest = paths => ({ version: 1, nonDeployPaths: paths });
const nightlyMatrix = { shardIndex: [1, 2, 3], shardTotal: [3] };
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readWorkflow = file => yaml.load(fs.readFileSync(path.join(rootDir, file), 'utf8'));
const findStep = (steps, name) => steps.find(step => step?.name === name);
const assertFields = (actual, expected) => {
  for (const [field, value] of Object.entries(expected)) {
    assert.deepEqual(actual[field], value);
  }
};
const currentRun = env => ({
  id: Number(env.GITHUB_RUN_ID),
  run_attempt: Number(env.GITHUB_RUN_ATTEMPT),
  head_sha: env.GITHUB_SHA,
  status: 'in_progress',
});
const runResponse = runs => ({ ok: true, json: async () => ({ workflow_runs: runs }) });
function guardEnv(root, overrides = {}) {
  const env = {
    CD_SCOPE_RECEIPT_PATH: path.join(root, 'scope.json'),
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_OUTPUT: path.join(root, 'output.txt'),
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'interdomestik/interdomestik',
    GITHUB_RUN_ATTEMPT: '3',
    GITHUB_RUN_ID: '41',
    GITHUB_SHA: sha('b'),
    GITHUB_TOKEN: 'test-token',
    ...overrides,
  };
  fs.writeFileSync(env.GITHUB_OUTPUT, '');
  return env;
}
async function assertFailureReceipt({ env, fetchImpl, root, error }) {
  await assert.rejects(() => runGuard(env, fetchImpl, root), error);
  const receipt = JSON.parse(fs.readFileSync(env.CD_SCOPE_RECEIPT_PATH, 'utf8'));
  assertFields(receipt, {
    sha: env.GITHUB_SHA,
    runId: 41,
    runAttempt: 3,
    outcome: 'failure',
    deploy: null,
  });
  assert.match(receipt.error, error);
  assert.equal(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8'), '');
}

test('manifest schema is closed, sorted, unique, and path-safe', () => {
  assert.deepEqual(
    parseScopeManifest(JSON.stringify(manifest(['docs/plans/current-program.md']))),
    manifest(['docs/plans/current-program.md'])
  );
  for (const invalid of [
    { version: 2, nonDeployPaths: ['docs/a.md'] },
    { version: 1, nonDeployPaths: [] },
    { version: 1, nonDeployPaths: ['docs/b.md', 'docs/a.md'] },
    { version: 1, nonDeployPaths: ['docs/a.md', 'docs/a.md'] },
    { version: 1, nonDeployPaths: ['../outside'] },
    { version: 1, nonDeployPaths: ['docs/*.md'] },
    { version: 1, nonDeployPaths: ['docs/a.md'], extra: true },
  ]) {
    assert.throws(() => parseScopeManifest(JSON.stringify(invalid)), /manifest/u);
  }
});

test('manual and version-tag events preserve deployment behavior', () => {
  for (const [eventName, ref, reason] of [
    ['workflow_dispatch', 'refs/heads/main', 'manual_dispatch'],
    ['push', 'refs/tags/v3.2.1', 'version_tag'],
  ]) {
    assert.deepEqual(classifyScope({ eventName, ref }), {
      deploy: true,
      reason,
      changedFiles: [],
    });
  }
});

test('known program-only push skips deploy and product or unknown paths deploy', () => {
  const input = {
    eventName: 'push',
    ref: 'refs/heads/main',
    manifest: manifest(['docs/plans/current-program.md', 'scripts/current-authority-state.mjs']),
  };
  assert.deepEqual(classifyScope({ ...input, changedFiles: ['docs/plans/current-program.md'] }), {
    deploy: false,
    reason: 'known_program_only',
    changedFiles: ['docs/plans/current-program.md'],
  });
  for (const changedFiles of [
    ['apps/web/src/app/page.tsx'],
    ['docs/plans/current-program.md', 'unclassified.txt'],
  ]) {
    assert.equal(classifyScope({ ...input, changedFiles }).deploy, true);
  }
});

test('CD workflow, guard, and manifest changes fail red instead of self-whitelisting', () => {
  const input = {
    eventName: 'push',
    ref: 'refs/heads/main',
    manifest: manifest([
      '.github/workflows/cd.yml',
      'scripts/ci/cd-nondeploy-guard.mjs',
      'scripts/ci/cd-nondeploy-scope.json',
    ]),
  };
  for (const changed of input.manifest.nonDeployPaths) {
    assert.throws(() => classifyScope({ ...input, changedFiles: [changed] }), /control path/u);
  }
});

test('empty ranges and unexpected events fail closed', () => {
  assert.throws(
    () =>
      classifyScope({
        eventName: 'push',
        ref: 'refs/heads/main',
        manifest: manifest(['docs/a.md']),
        changedFiles: [],
      }),
    /empty push range/u
  );
  assert.throws(
    () => classifyScope({ eventName: 'pull_request', ref: 'refs/pull/1/merge' }),
    /unsupported CD event/u
  );
});

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
function commit(root, message) {
  git(root, 'add', '.');
  git(root, '-c', 'user.name=CI Test', '-c', 'user.email=ci@example.test', 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

test('push evidence reads the parent manifest and the complete before-to-after range', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-scope-'));
  git(root, 'init');
  fs.mkdirSync(path.join(root, 'scripts/ci'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs/plans'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'scripts/ci/cd-nondeploy-scope.json'),
    `${JSON.stringify(manifest(['docs/plans/a.md']))}\n`
  );
  fs.writeFileSync(path.join(root, 'docs/plans/a.md'), 'a\n');
  const before = commit(root, 'parent manifest');
  fs.writeFileSync(path.join(root, 'docs/plans/a.md'), 'b\n');
  commit(root, 'intermediate');
  fs.writeFileSync(path.join(root, 'apps.txt'), 'product\n');
  const after = commit(root, 'after');
  try {
    const evidence = readPushEvidence({ root, before, after });
    assert.deepEqual(evidence.manifest, manifest(['docs/plans/a.md']));
    assert.deepEqual(evidence.changedFiles, ['apps.txt', 'docs/plans/a.md']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing parent manifest fails red even when the after tree adds it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-bootstrap-'));
  git(root, 'init');
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
  const before = commit(root, 'base');
  fs.mkdirSync(path.join(root, 'scripts/ci'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'scripts/ci/cd-nondeploy-scope.json'),
    `${JSON.stringify(manifest(['base.txt']))}\n`
  );
  const after = commit(root, 'bootstrap guard');
  try {
    assert.throws(() => readPushEvidence({ root, before, after }), /parent manifest/u);
    const env = guardEnv(root, {
      CD_BEFORE: before,
      CD_AFTER: after,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_SHA: after,
    });
    await assertFailureReceipt({ env, root, error: /parent manifest/u });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('only the exact current SHA and attempt may be nonterminal', () => {
  const current = { id: 41, run_attempt: 3, head_sha: sha('a'), status: 'in_progress' };
  assert.doesNotThrow(() =>
    assertNoCompetingRuns({ runs: [current], runId: 41, runAttempt: 3, sha: sha('a') })
  );
  for (const runs of [
    [current, { ...current, id: 40 }],
    [current, { ...current, id: 42, status: 'pending' }],
    [{ ...current, run_attempt: 2 }],
    [{ ...current, head_sha: sha('b') }],
  ]) {
    assert.throws(
      () => assertNoCompetingRuns({ runs, runId: 41, runAttempt: 3, sha: sha('a') }),
      /competing|exact current run/u
    );
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-race-'));
  const env = guardEnv(root);
  const competing = { ...currentRun(env), id: 42, status: 'queued' };
  return assertFailureReceipt({
    env,
    root,
    fetchImpl: async () => runResponse([currentRun(env), competing]),
    error: /competing nonterminal run/u,
  }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
});
test('success receipt is canonically bound to event SHA, range, run, and attempt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-success-'));
  const env = guardEnv(root);
  try {
    const receipt = await runGuard(env, async () => runResponse([currentRun(env)]), root);
    const bytes = fs.readFileSync(env.CD_SCOPE_RECEIPT_PATH);
    const output = new Set(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8').trim().split('\n'));
    assertFields(receipt, { sha: env.GITHUB_SHA, runId: 41, runAttempt: 3 });
    assert.equal(bytes.toString('utf8'), `${JSON.stringify(receipt)}\n`);
    assert.ok(output.has('deploy=true'));
    assert.ok(output.has(`receipt=${JSON.stringify(receipt)}`));
    assert.ok(output.has(`receipt_sha256=${createHash('sha256').update(bytes).digest('hex')}`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Sonar main gate skips manual fallback for non-push SonarCloud runs while keeping push blocking intact', () => {
  const workflow = readWorkflow('.github/workflows/sonar-main-gate.yml');
  const job = workflow.jobs['sonar-gate'];
  assert.ok(job);
  const steps = job.steps;
  const validateStep = findStep(steps, 'Validate Sonar configuration');
  const strategyStep = findStep(steps, 'Decide Sonar main gate strategy');
  const awaitStep = findStep(steps, 'Await SonarCloud Code Analysis check (blocking on push)');
  const fallbackStep = findStep(steps, 'Run Sonar quality gate (manual fallback)');
  assert.ok(validateStep);
  assert.equal(strategyStep.if, "env.SONAR_GATE_ENABLED == 'true'");
  for (const pattern of [
    /RUN_MANUAL_FALLBACK/,
    /sonarcloud\.io/,
    /SonarCloud Automatic Analysis owns mainline analysis/,
  ]) {
    assert.match(strategyStep.run, pattern);
  }
  assert.ok(awaitStep);
  assert.equal(awaitStep.if, "github.event_name == 'push' && env.SONAR_GATE_ENABLED == 'true'");
  assert.ok(fallbackStep);
  assert.equal(
    fallbackStep.if,
    "github.event_name != 'push' && env.SONAR_GATE_ENABLED == 'true' && env.RUN_MANUAL_FALLBACK == 'true'"
  );
});
test('Nightly E2E runs on an available hosted runner while preserving full strict coverage', () => {
  const nightlyWorkflow = readWorkflow('.github/workflows/e2e-nightly.yml');
  const nightlyJob = nightlyWorkflow.jobs.e2e;
  assertFields(nightlyJob, { 'runs-on': 'ubuntu-latest' });
  assert.deepEqual(nightlyWorkflow.on.schedule, [{ cron: '10 2 * * *' }]);
  assert.equal(nightlyJob.strategy['max-parallel'], 2);
  assert.deepEqual(nightlyJob.strategy.matrix, nightlyMatrix);
  const e2eDatabaseUrl =
    "${{ secrets.E2E_DATABASE_URL_RLS || secrets.E2E_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test' }}";
  for (const field of ['DATABASE_URL_RLS', 'E2E_DATABASE_URL_RLS']) {
    assert.equal(nightlyJob.env[field], e2eDatabaseUrl);
  }
  const nightlyStateStep = findStep(
    nightlyJob.steps,
    'Generate Playwright Gate Auth State (KS+MK)'
  );
  assert.ok(nightlyStateStep);
  assert.equal(nightlyStateStep.run, 'pnpm e2e:state:setup');
  for (const name of ['E2E Gate (KS+MK)', 'E2E Phase 5 Deterministic Batch', 'E2E Smoke']) {
    assert.ok(findStep(nightlyJob.steps, name));
  }
  assert.match(
    findStep(nightlyJob.steps, 'E2E Subscription Lifecycle (KS+MK)').run,
    /e2e\/golden\/subscription-entry\.spec\.ts/
  );
});
