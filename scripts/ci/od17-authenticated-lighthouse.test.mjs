import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  assertTokenAbsent,
  buildRequestHeaders,
  redactToken,
} from './od17-authenticated-lighthouse.mjs';
import {
  collectRemoteJavaScriptUrls,
  isMainModule,
  selectExactPreparation,
} from './od17-public-shell-performance.mjs';

const origin = 'https://interdomestik-abc123def-ecohub.vercel.app';
const token = 'secret.header.payload';

test('accepts only one successful exact-head pull-request preparation artifact', () => {
  const head = 'a'.repeat(40);
  // prettier-ignore
  const run = { id: 91, event: 'pull_request', status: 'completed', conclusion: 'success', head_sha: head,
    head_branch: 'codex/ida-t115-od17-performance-proof', path: '.github/workflows/od17-preview-canary.yml', run_attempt: 1,
    repository: { full_name: 'interdomestik/interdomestik' }, head_repository: { full_name: 'interdomestik/interdomestik' }, pull_requests: [{ number: 72 }] };
  // prettier-ignore
  const artifact = { id: 13, name: `od17-local-${head}`, expired: false, digest: `sha256:${'c'.repeat(64)}`, workflow_run: { id: 91 } };
  const input = { run, artifacts: [artifact], expectedHeadSha: head, pullNumber: '72' };
  assert.equal(selectExactPreparation(input).artifactId, 13);
  for (const change of [
    { run: { ...run, event: 'workflow_dispatch' } },
    { run: { ...run, head_sha: 'b'.repeat(40) } },
    { artifacts: [] },
    { artifacts: [artifact, artifact] },
    { artifacts: [{ ...artifact, expired: true }] },
  ])
    assert.throws(() => selectExactPreparation({ ...input, ...change }));
});

test('recognizes a relative CLI entry path', () => {
  const moduleUrl = new URL('./od17-public-shell-performance.mjs', import.meta.url).href;
  assert.equal(isMainModule('scripts/ci/od17-public-shell-performance.mjs', moduleUrl), true);
});

test('adds the OIDC header only to the exact preview origin on every hop', () => {
  const firstParty = buildRequestHeaders({
    requestUrl: `${origin}/sq`,
    previewOrigin: origin,
    oidcToken: token,
    headers: [{ name: 'accept', value: 'text/html' }],
  });
  assert.deepEqual(firstParty.at(-1), {
    name: 'x-vercel-trusted-oidc-idp-token',
    value: token,
  });
  assert.equal(
    buildRequestHeaders({
      requestUrl: `${origin}/redirect-hop`,
      previewOrigin: origin,
      oidcToken: token,
      headers: { accept: 'text/html' },
    }).at(-1).value,
    token
  );

  for (const requestUrl of [
    'https://interdomestik-abc123def-ecohub.vercel.app.attacker.test/x.js',
    'http://interdomestik-abc123def-ecohub.vercel.app/x.js',
    'https://interdomestik-abc123def-ecohub.vercel.app:444/x.js',
    'https://cdn.example/x.js',
  ]) {
    const headers = buildRequestHeaders({
      requestUrl,
      previewOrigin: origin,
      oidcToken: token,
      headers: [{ name: 'x-vercel-trusted-oidc-idp-token', value: token }],
    });
    assert.equal(
      headers.some(header => header.value === token),
      false
    );
  }
});

test('redacts token from serialized failures', () => {
  const serialized = JSON.stringify(redactToken({ error: `request failed ${token}` }, token));
  assert.doesNotMatch(serialized, /secret\.header\.payload/u);
  assert.match(serialized, /\[REDACTED\]/u);
});

test('rejects token reflection before response bytes can be encoded', () => {
  assert.throws(() => assertTokenAbsent(Buffer.from(`prefix ${token}`), token));
  assert.doesNotThrow(() => assertTokenAbsent(Buffer.from('safe response'), token));
});

test('remote closure is an exact-origin JavaScript union independent of local evidence', () => {
  assert.deepEqual(
    collectRemoteJavaScriptUrls({
      previewOrigin: origin,
      pageUrls: [`${origin}/_next/static/a.js`, `${origin}/_next/static/a.js`],
      lighthouseRequests: [
        { url: `${origin}/_next/static/b.js`, mimeType: 'application/javascript' },
        { url: `${origin}/_next/chunk`, mimeType: 'application/javascript' },
        { url: 'https://third.example/tracker.js', mimeType: 'application/javascript' },
        { url: `${origin}/font.woff2`, mimeType: 'font/woff2' },
      ],
    }),
    [`${origin}/_next/chunk`, `${origin}/_next/static/a.js`, `${origin}/_next/static/b.js`]
  );
});

test('collector source fails closed on interceptor and main-document attribution gaps', () => {
  const source = fs.readFileSync(
    new URL('./od17-authenticated-lighthouse.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /Target\.getTargets/u);
  assert.match(source, /Target\.attachToTarget/u);
  assert.doesNotMatch(source, /Target\.createTarget/u);
  assert.match(source, /OD17_INTERCEPTOR_NOT_READY/u);
  assert.match(source, /document\?\.statusCode !== 200/u);
  assert.match(source, /OD17_LIGHTHOUSE_DOCUMENT_MISMATCH/u);
  assert.match(source, /OD17_OIDC_NOT_REQUIRED/u);
  assert.match(source, /OD17_REMOTE_TOTAL_TOO_LARGE/u);
  assert.match(source, /OD17_EVIDENCE_TOO_LARGE/u);
  assert.match(source, /spawn\('\/usr\/bin\/google-chrome'/u);
  assert.doesNotMatch(source, /::add-mask::/u);
  assert.match(source, /state\.paused > 0/u);
});
