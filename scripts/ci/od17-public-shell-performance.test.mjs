import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFoundationCanaryIdentity,
  buildTrustedPreviewRequest,
} from './od17-public-shell-performance.mjs';

const SHA = 'a'.repeat(40);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('foundation canary accepts only protected-main same-repository PR identity', () => {
  assert.doesNotThrow(() =>
    assertFoundationCanaryIdentity({
      repository: 'interdomestik/interdomestik',
      workflowRef: 'refs/heads/main',
      pullRequest: {
        state: 'open',
        head: {
          ref: 'codex/ida-t115-od17-performance-proof',
          sha: SHA,
          repo: { full_name: 'interdomestik/interdomestik', fork: false },
        },
      },
      expectedHeadSha: SHA,
    })
  );
});

test('foundation canary rejects a fork, branch mismatch, closed PR, or wrong SHA', () => {
  const valid = {
    repository: 'interdomestik/interdomestik',
    workflowRef: 'refs/heads/main',
    pullRequest: {
      state: 'open',
      head: {
        ref: 'codex/ida-t115-od17-performance-proof',
        sha: SHA,
        repo: { full_name: 'interdomestik/interdomestik', fork: false },
      },
    },
    expectedHeadSha: SHA,
  };

  for (const change of [
    { workflowRef: 'refs/heads/feature' },
    { repository: 'someone/fork' },
    { pullRequest: { ...valid.pullRequest, state: 'closed' } },
    {
      pullRequest: {
        ...valid.pullRequest,
        head: { ...valid.pullRequest.head, sha: 'b'.repeat(40) },
      },
    },
    {
      pullRequest: {
        ...valid.pullRequest,
        head: { ...valid.pullRequest.head, repo: { full_name: 'fork/repo', fork: true } },
      },
    },
  ]) {
    assert.throws(() => assertFoundationCanaryIdentity({ ...valid, ...change }));
  }
});

test('trusted preview request requires an in-memory OIDC header and exact HTTPS URL', () => {
  assert.deepEqual(
    buildTrustedPreviewRequest({
      previewUrl: 'https://preview.example.vercel.app',
      expectedPreviewUrl: 'https://preview.example.vercel.app/',
      oidcToken: 'header.payload.signature',
    }),
    {
      url: 'https://preview.example.vercel.app/',
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
      expectedPreviewUrl: 'https://preview.example.vercel.app',
      oidcToken: 'header.payload.signature',
    })
  );
});

test('foundation workflow is manual, protected-main, and token-inert', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/od17-preview-canary.yml'),
    'utf8'
  );

  assert.match(source, /^  workflow_dispatch:/mu);
  assert.doesNotMatch(
    source,
    /^  (push|pull_request|pull_request_target|schedule|workflow_call):/mu
  );
  assert.match(source, /runs-on: ubuntu-latest/u);
  assert.match(
    source,
    /github\.repository == 'interdomestik\/interdomestik' && github\.ref == 'refs\/heads\/main'/u
  );
  assert.match(source, /contents: read[\s\S]*pull-requests: read[\s\S]*id-token: write/u);
  assert.match(source, /persist-credentials: false/u);
  assert.match(source, /actions\/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6\.0\.1/u);
  assert.match(source, /assertFoundationCanaryIdentity/u);
  assert.doesNotMatch(source, /ACTIONS_ID_TOKEN_REQUEST_URL|VERCEL_TOKEN|secrets\./u);
});
