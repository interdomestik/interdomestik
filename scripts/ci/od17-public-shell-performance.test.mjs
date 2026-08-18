import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertFoundationCanaryIdentity,
  buildTrustedPreviewRequest,
  selectExactCanary,
  selectExactPreviewDeployment,
} from './od17-public-shell-performance.mjs';
const SHA = 'a'.repeat(40);
const preview = 'https://interdomestik-web-abc123def-ecohub.vercel.app';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// prettier-ignore
const validIdentity = { repository: 'interdomestik/interdomestik', workflowRef: 'refs/heads/main',
  pullRequest: { state: 'open', head: { ref: 'codex/ida-t115-od17-performance-proof', sha: SHA,
    repo: { full_name: 'interdomestik/interdomestik', fork: false } } }, expectedHeadSha: SHA };
test('foundation canary accepts only protected-main same-repository PR identity', () => {
  assert.doesNotThrow(() => assertFoundationCanaryIdentity(validIdentity));
});
test('foundation canary rejects a fork, branch mismatch, closed PR, or wrong SHA', () => {
  const valid = validIdentity;
  // prettier-ignore
  for (const change of [
    { workflowRef: 'refs/heads/feature' },
    { repository: 'someone/fork' },
    { pullRequest: { ...valid.pullRequest, state: 'closed' } },
    { pullRequest: { ...valid.pullRequest, head: { ...valid.pullRequest.head, sha: 'b'.repeat(40) } } },
    { pullRequest: { ...valid.pullRequest, head: { ...valid.pullRequest.head, repo: { full_name: 'fork/repo', fork: true } } } },
  ]) {
    assert.throws(() => assertFoundationCanaryIdentity({ ...valid, ...change }));
  }
});
test('trusted preview request requires an in-memory OIDC header and exact HTTPS URL', () => {
  assert.deepEqual(
    buildTrustedPreviewRequest({
      previewUrl: preview,
      expectedPreviewUrl: `${preview}/`,
      oidcToken: 'header.payload.signature',
    }),
    {
      url: `${preview}/`,
      headers: { 'x-vercel-trusted-oidc-idp-token': 'header.payload.signature' },
    }
  );
  assert.throws(() =>
    buildTrustedPreviewRequest({
      previewUrl: 'http://preview.test',
      expectedPreviewUrl: 'http://preview.test',
      oidcToken: 'x',
    })
  );
  assert.throws(() =>
    buildTrustedPreviewRequest({
      previewUrl: 'https://preview.test',
      expectedPreviewUrl: 'https://preview.test',
      oidcToken: '',
    })
  );
  assert.throws(() =>
    buildTrustedPreviewRequest({
      previewUrl: 'https://attacker.example',
      expectedPreviewUrl: preview,
      oidcToken: 'header.payload.signature',
    })
  );
});
test('selects one successful exact-head non-production deployment', () => {
  // prettier-ignore
  const deployment = { id: 17, sha: SHA, ref: 'codex/ida-t115-od17-performance-proof', performed_via_github_app: { slug: 'vercel' }, environment: 'Preview', production_environment: false,
    latest_status: { id: 23, state: 'success', environment_url: preview } };
  const selected = selectExactPreviewDeployment({
    expectedHeadSha: SHA,
    deployments: [deployment],
  });
  assert.equal(selected.url, `${preview}/`);
  // prettier-ignore
  for (const deployments of [
    [],
    [deployment, deployment],
    [{ ...deployment, sha: 'b'.repeat(40) }],
    [{ ...deployment, production_environment: true }],
    [{ ...deployment, performed_via_github_app: { slug: 'attacker' } }],
    [{ ...deployment, latest_status: { ...deployment.latest_status, environment_url: 'https://attacker.example' } }],
    [{ ...deployment, latest_status: { ...deployment.latest_status, environment_url: 'https://interdomestik-web-git-od17-ecohub.vercel.app' } }],
    [{ ...deployment, latest_status: { ...deployment.latest_status,
      environment_url: `${preview}/path` } }],
  ]) {
    assert.throws(() => selectExactPreviewDeployment({ expectedHeadSha: SHA, deployments }));
  }
});
test('selects one content-addressed canary with positive run and artifact identities', () => {
  const main = 'b'.repeat(40);
  // prettier-ignore
  const run = { id: 19, run_attempt: 1, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: main, path: '.github/workflows/od17-preview-canary.yml' };
  const artifact = {
    id: 23,
    name: `od17-canary-${SHA}`,
    expired: false,
    digest: `sha256:${'c'.repeat(64)}`,
    workflow_run: { id: 19 },
  };
  const input = {
    runs: [run],
    artifactsByRun: new Map([[19, [artifact]]]),
    expectedHeadSha: SHA,
    expectedTrustedMainSha: main,
  };
  assert.equal(selectExactCanary(input).artifactId, 23);
  assert.throws(() => selectExactCanary({ ...input, runs: [{ ...run, id: 0 }] }));
  assert.throws(() =>
    selectExactCanary({ ...input, artifactsByRun: new Map([[19, [{ ...artifact, id: 0 }]]]) })
  );
});
test('collector splits pull-request preparation from manual trusted main', () => {
  // prettier-ignore
  const source = fs.readFileSync(path.join(repoRoot, '.github/workflows/od17-preview-canary.yml'), 'utf8');
  assert.match(source, /^  pull_request:/mu);
  assert.match(source, /^  workflow_dispatch:/mu);
  assert.doesNotMatch(source, /^  (push|pull_request_target|schedule|workflow_call):/mu);
  assert.match(source, /prepare-exact-head:[\s\S]*id-token: none/u);
  assert.match(source, /trusted-main-collector:[\s\S]*id-token: write/u);
  assert.match(source, /github\.event_name == 'pull_request'/u);
  assert.match(source, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(source, /run-id: \$\{\{ inputs\.preparation_run_id \}\}/u);
  assert.match(source, /actions: read[\s\S]*deployments: read/u);
  // prettier-ignore
  assert.match(source, /github\.repository == 'interdomestik\/interdomestik' && github\.ref == 'refs\/heads\/main'/u);
  assert.match(source, /persist-credentials: false/u);
  assert.match(source, /actions\/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6\.0\.1/u);
  assert.match(source, /run: node scripts\/ci\/od17-public-shell-performance\.mjs/u);
  assert.match(source, /run: node scripts\/ci\/od17-authenticated-lighthouse\.mjs/u);
  assert.match(source, /pnpm install --frozen-lockfile --prefer-offline --ignore-scripts/u);
  assert.match(source, /if: always\(\)/u);
  assert.doesNotMatch(
    source.slice(source.indexOf('trusted-main-collector:')),
    /uses: .+@(v\d+|main)\b/u
  );
  assert.doesNotMatch(source, /VERCEL_TOKEN|secrets\./u);
  assert.doesNotMatch(source, /^permissions:\s*\n(?: {2}.+\n)+/mu);
});
