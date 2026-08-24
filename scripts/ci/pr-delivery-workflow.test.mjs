import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import { GitHubClient, trustedGitHubApiUrl } from './pr-delivery-api.mjs';
import { resolvePackageJsonSurface } from './pr-delivery-gate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const B = '1'.repeat(40);
const H = '2'.repeat(40);

test('GitHub API boundary rejects foreign paths and query keys', () => {
  assert.equal(
    trustedGitHubApiUrl(
      `repos/interdomestik/interdomestik/commits/${H}/check-runs?filter=all&page=1`
    ).origin,
    'https://api.github.com'
  );
  assert.equal(
    trustedGitHubApiUrl(
      `repos/interdomestik/interdomestik/contents/package.json?ref=${H}`
    ).searchParams.get('ref'),
    H
  );
  for (const endpoint of [
    'https://example.invalid/repos/interdomestik/interdomestik',
    'repos/interdomestik/interdomestik/../../users',
    'repos/interdomestik/interdomestik/%2e%2e/users',
    'repos/interdomestik/interdomestik/pulls/1?page=zero',
    'repos/interdomestik/interdomestik/pulls/1?token=secret',
    'repos/interdomestik/interdomestik/contents/package.json?ref=main',
  ]) {
    assert.throws(() => trustedGitHubApiUrl(endpoint), /unsafe|trusted boundary/u);
  }
});

test('direct gate invocation cannot silently succeed without runtime evidence', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-gate-entrypoint-'));
  const linkedGate = path.join(temporary, 'delivery-gate.mjs');
  fs.symlinkSync(path.join(root, 'scripts/ci/pr-delivery-gate.mjs'), linkedGate);
  try {
    const result = spawnSync(process.execPath, [linkedGate], {
      cwd: root,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /delivery gate failed:/u);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('GitHub requests pin headers and classify transient failures', async () => {
  let captured;
  const okClient = new GitHubClient(
    'interdomestik/interdomestik',
    'trusted-token',
    async (_, init) => {
      captured = init;
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ ok: true }) };
    }
  );
  await okClient.request('repos/interdomestik/interdomestik/pulls/1', {
    redirect: 'follow',
    headers: {
      Accept: 'text/plain',
      Authorization: 'Bearer attacker',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': 'attacker',
    },
  });
  assert.equal(captured.redirect, 'error');
  assert.equal(captured.headers.Accept, 'application/vnd.github+json');
  assert.equal(captured.headers.Authorization, 'Bearer trusted-token');
  assert.equal(captured.headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(captured.headers['Content-Type'], 'application/json');

  for (const [status, expected] of [
    [503, /WAIT:/u],
    [403, /WAIT:/u],
    [422, /returned 422/u],
  ]) {
    const client = new GitHubClient('interdomestik/interdomestik', 'token', async () => ({
      ok: false,
      status,
      headers: new Headers(status === 403 ? { 'x-ratelimit-remaining': '0' } : {}),
    }));
    await assert.rejects(client.request('repos/interdomestik/interdomestik/pulls/1'), expected);
  }
});

test('REST pagination follows Link metadata and exposes its ceiling', async () => {
  let calls = 0;
  const client = new GitHubClient('interdomestik/interdomestik', 'token', async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: new Headers(
        calls === 1 ? { link: '<https://api.github.com/resource?page=2>; rel="next"' } : {}
      ),
      json: async () => [calls],
    };
  });
  assert.deepEqual(await client.pages('repos/interdomestik/interdomestik/pulls/1/reviews'), {
    values: [1, 2],
    complete: true,
  });
  const exhausted = new GitHubClient('interdomestik/interdomestik', 'token', async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ link: '<https://api.github.com/resource?page=2>; rel="next"' }),
    json: async () => [],
  }));
  assert.equal(
    (await exhausted.pages('repos/interdomestik/interdomestik/pulls/1/reviews')).complete,
    false
  );
});

test('package.json validation uses cached immutable base and head contents', async () => {
  let requests = 0;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
  const client = new GitHubClient('interdomestik/interdomestik', 'token', async url => {
    requests += 1;
    const content =
      url.searchParams.get('ref') === B
        ? { scripts: { check: 'pnpm lint' } }
        : { scripts: { check: 'pnpm lint', 'repo:size:check': 'node check.mjs' } };
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ encoding: 'base64', content: encode(content) }),
    };
  });
  assert.deepEqual(await resolvePackageJsonSurface(client, ['package.json'], B, H), {
    isNonProductOnly: true,
  });
  await resolvePackageJsonSurface(client, ['package.json'], B, H);
  assert.equal(requests, 2, 'immutable package contents must be cached per SHA');
});

test('delivery workflow is API-only, exact-bound, acyclic, and default-deny', () => {
  const source = read('.github/workflows/pr-delivery-gate.yml');
  const workflow = yaml.load(source);
  const job = workflow.jobs['delivery-gate'];

  assert.ok(job);
  assert.equal(job['timeout-minutes'], 90);
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
  assert.deepEqual(job.permissions, {
    actions: 'read',
    checks: 'read',
    contents: 'read',
    issues: 'read',
    'pull-requests': 'read',
    statuses: 'read',
  });
  assert.deepEqual(workflow.on.pull_request_review.types, ['submitted', 'edited', 'dismissed']);
  assert.deepEqual(workflow.on.pull_request_review_comment.types, ['created', 'edited', 'deleted']);
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
  ]);
  assert.ok(workflow.on.pull_request.types.includes('review_requested'));
  assert.ok(workflow.on.pull_request.types.includes('review_request_removed'));
  assert.deepEqual(Object.keys(workflow.jobs), ['delivery-gate']);
  assert.equal(job.needs, undefined);
  assert.match(job.if, /github\.event\.pull_request\.base\.ref == 'main'/u);
  assert.match(workflow.concurrency.group, /github\.event\.pull_request\.number/u);
  assert.ok(job.steps.some(step => String(step.uses).startsWith('actions/checkout@')));
  const checkout = job.steps.find(step => String(step.uses).startsWith('actions/checkout@'));
  assert.match(checkout.with.ref, /github\.sha/u);
  const setupNodeIndex = job.steps.findIndex(step =>
    String(step.uses).startsWith('actions/setup-node@')
  );
  const gateIndex = job.steps.findIndex(step =>
    String(step.run).includes('scripts/ci/pr-delivery-gate.mjs')
  );
  assert.ok(setupNodeIndex >= 0 && setupNodeIndex < gateIndex);
  assert.equal(job.steps[setupNodeIndex].with['node-version-file'], '.nvmrc');
  assert.equal(job.steps[setupNodeIndex].with['package-manager-cache'], false);
  assert.match(job.steps[setupNodeIndex].uses, /@[a-f0-9]{40}$/u);
  assert.ok(job.steps.some(step => String(step.run).includes('scripts/ci/pr-delivery-gate.mjs')));
  const gate = job.steps.find(step => String(step.run).includes('scripts/ci/pr-delivery-gate.mjs'));
  assert.match(gate.env.PR_NUMBER, /github\.event\.pull_request\.number/u);
  for (const forbidden of [
    'pnpm install',
    'npm install',
    'docker',
    'playwright',
    'seed',
    'database',
    'actions: write',
    '/rerun',
    'delivery-reconciler',
    'pull_request_target',
    'workflow_dispatch',
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden, 'iu'));
  }
  assert.doesNotMatch(source, /branchProtectionRules|requiredStatusCheckContexts/u);
  for (const binding of [
    'github.event.pull_request.base.sha',
    'github.event.pull_request.head.sha',
    'github.sha',
    'github.run_id',
    'github.run_attempt',
  ]) {
    assert.match(source, new RegExp(binding.replaceAll('.', String.raw`\.`)));
  }
});

test('manifest consumers are wired and finalizer never waits for delivery-gate', () => {
  const contractPath = 'scripts/ci/pr-delivery-contract.json';
  const contract = JSON.parse(read(contractPath));
  const finalizer = read('scripts/pr-finalizer.sh');
  const finalizerLib = read('scripts/pr-finalizer-lib.sh');
  const feedbackLib = read('scripts/pr-finalizer-feedback-lib.sh');
  const governance = read('scripts/github-pr-governance-report.mjs');
  const reviewReady = read('scripts/pr-review-ready.sh');

  for (const source of [finalizer, feedbackLib, governance, reviewReady]) {
    assert.match(source, /pr-delivery-contract\.json/u);
  }
  assert.match(finalizerLib, /PR_DELIVERY_CONTRACT/u);
  assert.match(finalizerLib, /Sonar state is reported by governance monitoring/u);
  assert.match(finalizerLib, /other generator states are also deferred/u);
  assert.doesNotMatch(finalizer, /required_checks=\(/u);
  assert.doesNotMatch(finalizerLib, /success.*skipped.*neutral/su);
  assert.doesNotMatch(reviewReady, /ALLOW_MISSING_COPILOT/u);
  assert.match(reviewReady, /pr-review-ready failed: invalid delivery contract/u);
  assert.doesNotMatch(governance, /request Copilot review/u);
  assert.ok(contract.finalizerLeafPrerequisites.every(item => item.context !== 'delivery-gate'));
});
