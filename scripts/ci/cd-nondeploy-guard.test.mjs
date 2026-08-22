import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import yaml from 'js-yaml';
import {
  assertNoCompetingRuns,
  classifyScope,
  fetchRunPage,
  parseScopeManifest,
  readPushEvidence,
  runGuard,
} from './cd-nondeploy-guard.mjs';
const sha = character => character.repeat(40);
const manifest = paths => ({ version: 1, nonDeployPaths: paths });
const runsPath = '/repos/interdomestik/interdomestik/actions/workflows/cd.yml/runs';
const rootDir = new URL('../../', import.meta.url);
const readRepoText = file => fs.readFileSync(new URL(file, rootDir), 'utf8');
const readWorkflow = file => yaml.load(readRepoText(file));
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
const receiptPath = (root, env) => {
  const fileName = `scope-${env.GITHUB_RUN_ATTEMPT}-${env.GITHUB_SHA}.json`;
  return path.join(root, 'tmp/cd-evidence', env.GITHUB_RUN_ID, fileName);
};
function guardEnv(root, overrides = {}) {
  return {
    CD_SCOPE_RECEIPT_PATH: path.join(root, `../${path.basename(root)}-receipt.json`),
    GITHUB_API_URL: 'http://127.0.0.1:9',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_OUTPUT: path.join(root, `../${path.basename(root)}-output.txt`),
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REPOSITORY: 'attacker/repository/../../target',
    GITHUB_RUN_ATTEMPT: '3',
    GITHUB_RUN_ID: '41',
    GITHUB_SHA: sha('b'),
    GITHUB_TOKEN: 'test-token',
    ...overrides,
  };
}
async function assertFailureReceipt({ env, fetchImpl, root, error }) {
  const outputs = [];
  await assert.rejects(() => runGuard(env, fetchImpl, root, value => outputs.push(value)), error);
  const receipt = JSON.parse(fs.readFileSync(receiptPath(root, env), 'utf8'));
  assertFields(receipt, {
    sha: env.GITHUB_SHA,
    runId: 41,
    runAttempt: 3,
    outcome: 'failure',
    deploy: null,
  });
  assert.match(receipt.error, error);
  assert.deepEqual(outputs, []);
  assert.equal(fs.existsSync(env.CD_SCOPE_RECEIPT_PATH), false);
  assert.equal(fs.existsSync(env.GITHUB_OUTPUT), false);
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
  const repositoryManifest = parseScopeManifest(readRepoText('scripts/ci/cd-nondeploy-scope.json'));
  for (const path of [
    'scripts/ci/cd-trusted-parent-guard.test.mjs',
    'scripts/repo-size-budget.json',
  ]) {
    assert.ok(repositoryManifest.nonDeployPaths.includes(path));
  }
  const budgetDecision = classifyScope({
    ...input,
    manifest: repositoryManifest,
    changedFiles: ['scripts/repo-size-budget.json'],
  });
  assert.equal(budgetDecision.deploy, false);
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
  const emptyPush = {
    eventName: 'push',
    ref: 'refs/heads/main',
    manifest: manifest(['docs/a.md']),
    changedFiles: [],
  };
  assert.throws(() => classifyScope(emptyPush), /empty push range/u);
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
function writeRepoFile(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}
test('push evidence reads the parent manifest and the complete before-to-after range', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-scope-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init');
  writeRepoFile(
    root,
    'scripts/ci/cd-nondeploy-scope.json',
    `${JSON.stringify(manifest(['docs/plans/a.md']))}\n`
  );
  writeRepoFile(root, 'docs/plans/a.md', 'a\n');
  const before = commit(root, 'parent manifest');
  fs.writeFileSync(path.join(root, 'docs/plans/a.md'), 'b\n');
  commit(root, 'intermediate');
  fs.writeFileSync(path.join(root, 'apps.txt'), 'product\n');
  const after = commit(root, 'after');
  const evidence = readPushEvidence({ root, before, after });
  assert.deepEqual(evidence.manifest, manifest(['docs/plans/a.md']));
  assert.deepEqual(evidence.changedFiles, ['apps.txt', 'docs/plans/a.md']);
});
test('missing parent manifest fails red even when the after tree adds it', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-bootstrap-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init');
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
  const before = commit(root, 'base');
  writeRepoFile(
    root,
    'scripts/ci/cd-nondeploy-scope.json',
    `${JSON.stringify(manifest(['base.txt']))}\n`
  );
  const after = commit(root, 'bootstrap guard');
  assert.throws(() => readPushEvidence({ root, before, after }), /parent manifest/u);
  const env = guardEnv(root, {
    CD_BEFORE: before,
    CD_AFTER: after,
    GITHUB_EVENT_NAME: 'push',
    GITHUB_SHA: after,
  });
  await assertFailureReceipt({ env, root, error: /parent manifest/u });
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
test('run-page lookup pins its target and validates response shape', async () => {
  const requests = [];
  const runs = await fetchRunPage({
    token: 'test-token',
    status: 'queued',
    page: 2,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return runResponse([{ id: 42, run_attempt: 1 }]);
    },
  });
  assert.deepEqual(runs, [{ id: 42, run_attempt: 1 }]);
  assert.equal(requests[0].url.origin, 'https://api.github.com');
  assert.equal(requests[0].url.pathname, runsPath);
  assert.equal(requests[0].url.searchParams.get('status'), 'queued');
  assert.equal(requests[0].url.searchParams.get('page'), '2');
  assert.equal(requests[0].options.redirect, 'error');
});
test('success receipt is canonically bound to event SHA, range, run, and attempt', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-success-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = guardEnv(root);
  const outputs = [];
  let requestCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    return runResponse([currentRun(env)]);
  };
  const receipt = await runGuard(env, fetchImpl, root, value => outputs.push(value));
  const bytes = fs.readFileSync(receiptPath(root, env));
  assertFields(receipt, { sha: env.GITHUB_SHA, runId: 41, runAttempt: 3 });
  assert.equal(bytes.toString('utf8'), `${JSON.stringify(receipt)}\n`);
  const receiptDigest = createHash('sha256').update(bytes).digest('hex');
  const expectedOutput = `deploy=true\nreceipt=${JSON.stringify(receipt)}\nreceipt_sha256=${receiptDigest}\n`;
  assert.deepEqual(outputs, [expectedOutput]);
  assert.equal(fs.existsSync(env.CD_SCOPE_RECEIPT_PATH), false);
  assert.equal(fs.existsSync(env.GITHUB_OUTPUT), false);
  assert.equal(requestCount, 5);
});
test('Sonar main gate skips manual fallback for non-push SonarCloud runs while keeping push blocking intact', () => {
  const job = readWorkflow('.github/workflows/sonar-main-gate.yml').jobs['sonar-gate'];
  const validate = findStep(job.steps, 'Validate Sonar configuration');
  const strategy = findStep(job.steps, 'Decide Sonar main gate strategy');
  const awaitCheck = findStep(job.steps, 'Await SonarCloud Code Analysis check (blocking on push)');
  const fallback = findStep(job.steps, 'Run Sonar quality gate (manual fallback)');
  assert.ok(job && validate && awaitCheck && fallback);
  assert.equal(strategy.if, "env.SONAR_GATE_ENABLED == 'true'");
  for (const pattern of [
    /RUN_MANUAL_FALLBACK/,
    /sonarcloud\.io/,
    /SonarCloud Automatic Analysis owns mainline analysis/,
  ]) {
    assert.match(strategy.run, pattern);
  }
  assert.equal(awaitCheck.if, "github.event_name == 'push' && env.SONAR_GATE_ENABLED == 'true'");
  assert.equal(
    fallback.if,
    "github.event_name != 'push' && env.SONAR_GATE_ENABLED == 'true' && env.RUN_MANUAL_FALLBACK == 'true'"
  );
});
