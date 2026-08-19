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
const SHA = '6ede23899a3b5b4c429f89739113073877f722d7';
const preview = 'https://interdomestik-i5yo55nz6-ecohub.vercel.app';
const BOT = { id: 35613825, node_id: 'MDM6Qm90MzU2MTM4MjU=', login: 'vercel[bot]', type: 'Bot', html_url: 'https://github.com/apps/vercel' };
const APP = { id: 8329, node_id: 'MDM6QXBwODMyOQ==', slug: 'vercel' };
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
test('replays GitHub Deployment 5981435922 and rejects projection ambiguity', () => {
  // prettier-ignore
  const deployment = { id: 5981435922, sha: SHA, ref: SHA, task: 'deploy', environment: 'Preview', production_environment: false, creator: BOT, performed_via_github_app: null,
    latest_status: { id: 17012107025, state: 'success', environment: 'Preview', environment_url: preview, target_url: preview, creator: BOT, performed_via_github_app: null } };
  const selected = selectExactPreviewDeployment({ expectedHeadSha: SHA, deployments: [deployment] });
  assert.deepEqual([selected.deploymentId, selected.statusId, selected.ref, selected.url], [5981435922, 17012107025, SHA, `${preview}/`]);
  const appBound = { ...deployment, performed_via_github_app: APP, latest_status: { ...deployment.latest_status, performed_via_github_app: APP } };
  assert.equal(selectExactPreviewDeployment({ expectedHeadSha: SHA, deployments: [appBound] }).deploymentId, 5981435922);
  // prettier-ignore
  const invalid = [
    null, [], [deployment, deployment], [deployment, { ...deployment, id: 77, sha: 'b'.repeat(40) }], [{ ...deployment, sha: 'b'.repeat(40) }], [{ ...deployment, ref: 'codex/ida-t115-od17-performance-proof' }], [{ ...deployment, task: 'build' }],
    [{ ...deployment, environment: 'Production' }], [{ ...deployment, production_environment: true }], [{ ...deployment, id: 0 }], [{ ...deployment, id: '5981435922' }], [{ ...deployment, latest_status: { ...deployment.latest_status, id: 0 } }],
    [{ ...deployment, creator: { ...BOT, id: 1 } }], [{ ...deployment, creator: { ...BOT, node_id: 'wrong' } }], [{ ...deployment, creator: { ...BOT, login: 'vercel' } }], [{ ...deployment, creator: { ...BOT, type: 'User' } }], [{ ...deployment, creator: { ...BOT, html_url: 'https://github.com/vercel' } }], [{ ...deployment, latest_status: { ...deployment.latest_status, creator: { ...BOT, id: 1 } } }],
    [{ ...deployment, performed_via_github_app: undefined }], [{ ...deployment, performed_via_github_app: { ...APP, id: 1 } }], [{ ...deployment, latest_status: { ...deployment.latest_status, performed_via_github_app: undefined } }], [{ ...deployment, latest_status: { ...deployment.latest_status, performed_via_github_app: { ...APP, slug: 'attacker' } } }],
    [{ ...deployment, latest_status: { ...deployment.latest_status, state: 'failure' } }], [{ ...deployment, latest_status: { ...deployment.latest_status, state: 'pending' } }], [{ ...deployment, latest_status: { ...deployment.latest_status, environment: 'Production' } }],
    [{ ...deployment, latest_status: { ...deployment.latest_status, target_url: 'https://attacker.example' } }],
    ...['https://attacker.example', 'https://interdomestik-web-abc123def-ecohub.vercel.app', 'https://interdomestik-git-branch-ecohub.vercel.app', `${preview}/path`, `${preview}/x/..`, `${preview}/%2e`, `${preview}?query=1`, `${preview}#fragment`, 'https://interdomestik-i5yo55nz6-ecohub.vercel.app:444', 'https://interdomestik-i5yo55nz6-ecohub.vercel.app:443', 'https://user:pass@interdomestik-i5yo55nz6-ecohub.vercel.app', 'HTTPS://interdomestik-i5yo55nz6-ecohub.vercel.app', ` ${preview}`].map(url => [{ ...deployment, latest_status: { ...deployment.latest_status, environment_url: url, target_url: url } }]),
  ];
  for (const deployments of invalid) {
    assert.throws(() => selectExactPreviewDeployment({ expectedHeadSha: SHA, deployments }));
  }
});
test('selects one completed content-addressed canary independent of its conclusion', () => {
  const main = 'b'.repeat(40);
  // prettier-ignore
  const run = { id: 19, run_attempt: 1, event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_branch: 'main', head_sha: main, path: '.github/workflows/od17-preview-canary.yml' };
  // prettier-ignore
  const artifact = { id: 23, name: `od17-canary-${SHA}`, expired: false, digest: `sha256:${'c'.repeat(64)}`, workflow_run: { id: 19 } };
  const input = {
    runs: [run],
    artifactsByRun: new Map([[19, [artifact]]]),
    expectedHeadSha: SHA,
    expectedTrustedMainSha: main,
  };
  assert.equal(selectExactCanary(input).artifactId, 23);
  assert.equal(selectExactCanary({ ...input, runs: [{ ...run, conclusion: 'failure' }] }).artifactId, 23);
  assert.throws(() => selectExactCanary({ ...input, runs: [{ ...run, id: 0 }] }));
  assert.throws(() =>
    selectExactCanary({ ...input, artifactsByRun: new Map([[19, [{ ...artifact, id: 0 }]]]) })
  );
  assert.throws(() =>
    selectExactCanary({
      ...input,
      artifactsByRun: new Map([[19, [{ ...artifact, digest: 'sha256:c' }]]]),
    })
  );
});
test('collector splits pull-request preparation from manual trusted main', () => {
  // prettier-ignore
  const source = fs.readFileSync(path.join(repoRoot, '.github/workflows/od17-preview-canary.yml'), 'utf8'), verifierSource = fs.readFileSync(new URL('./od17-public-shell-performance.mjs', import.meta.url), 'utf8');
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
  // prettier-ignore
  assert.match(verifierSource, /GH_BINARY_CANDIDATES = \['\/usr\/bin\/gh', '\/opt\/homebrew\/bin\/gh', '\/usr\/local\/bin\/gh'\]/u); assert.doesNotMatch(verifierSource, /execFileSync\('gh'/u); assert.match(verifierSource, /new URLSearchParams\(\{ sha: head, ref: head, environment: 'Preview', per_page: '2' \}\)/u); assert.doesNotMatch(verifierSource, /ref: BRANCH, environment: 'Preview'/u);
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
