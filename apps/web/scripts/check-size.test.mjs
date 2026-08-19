import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  assertManifestInventory,
  collectManifestJavaScriptPaths,
  evaluateOd17Evidence,
  isSafeOd17AssetPath,
  verifyOd17Files,
} from './check-size.mjs';

const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ORIGIN = 'https://interdomestik-abc123def-ecohub.vercel.app';
const sha = body => createHash('sha256').update(body).digest('hex');
// prettier-ignore
const withReport = (item, report) => ({ ...item, report, reportSha256: sha(JSON.stringify(report)) });
const localBody = Buffer.from('local-structural-build');
const remoteBody = Buffer.from('remote-vercel-build');
const pageBody = Buffer.from('<html><script src="/_next/chunk?v=1"></script></html>');
// prettier-ignore
const localRow = { path: 'static/chunks/local.js', bytes: localBody.length, gzipBytes: gzipSync(localBody, { level: 9 }).length, sha256: sha(localBody) };

// prettier-ignore
function observation(locale, change = {}) {
  const url = `${ORIGIN}/${locale}`, assetUrl = `${ORIGIN}/_next/chunk?v=1`;
  const asset = { url: assetUrl, sha256: sha(remoteBody), gzipBytes: gzipSync(remoteBody, { level: 9 }).length, bodyBase64: remoteBody.toString('base64') };
  const report = { lighthouseVersion: '13.4.1', configSettings: { formFactor: 'mobile', screenEmulation: { mobile: true } }, categories: { performance: { score: 0.95 } }, finalDisplayedUrl: url, audits: { 'network-requests': { details: { items: [{ url: assetUrl, mimeType: 'application/javascript' }] } } } };
  return { locale, url, ttfbMs: 50, vercelId: 'fra1::abc', availabilityStatus: 200,
    unauthenticatedStatus: 401, pageBase64: pageBody.toString('base64'), pageSha256: sha(pageBody),
    score: 95, gzipBytes: asset.gzipBytes, assets: [asset], report: {
      ...report }, reportSha256: sha(JSON.stringify(report)), lighthouseVersion: '13.4.1', chromeVersion: 'Chrome/140.0.0.0', ...change };
}
// prettier-ignore
function evidence(change = {}) { return { headSha: HEAD, deploymentSha: HEAD, previewOrigin: ORIGIN,
  schemaVersion: 1, workflowPath: '.github/workflows/od17-preview-canary.yml', trustedMainSha: MAIN,
  pullNumber: 72, runId: 19, runAttempt: 1, preparationRunId: 17, preparationRunAttempt: 1,
  preparationArtifactId: 23, preparationArtifactDigest: `sha256:${'c'.repeat(64)}`, deploymentId: 29, statusId: 31,
  deploymentEnvironment: 'Preview', deploymentProduction: false,
  deploymentRef: HEAD, eventName: 'workflow_dispatch', headBranch: 'main',
  thresholds: { scoreAbove: 90, gzipBelow: 122880, ttfbBelowMs: 100 }, recomputedVerdict: 'pass',
  observations: ['sq', 'mk', 'en'].map(locale => observation(locale)), ...change };
}
// prettier-ignore
const expected = { expectedTrustedMainSha: MAIN, pullNumber: 72, canary: { runId: 19, runAttempt: 1, artifactId: 37, artifactDigest: `sha256:${'d'.repeat(64)}` },
  preparation: { runId: 17, runAttempt: 1, artifactId: 23, artifactDigest: `sha256:${'c'.repeat(64)}` } };
test('uses producer-identical code-unit ordering and rejects unsafe local asset paths', () => {
  const safe = 'static/chunks/app/(group)/[locale]/a%20b.js';
  const manifests = { z: 'static/chunks/z.js', a: safe };
  assert.deepEqual(collectManifestJavaScriptPaths(manifests), [safe, 'static/chunks/z.js'].sort());
  assert.equal(isSafeOd17AssetPath(safe), true);
  for (const value of ['static/../x.js', 'static/%2e/x.js', 'static/%2f/x.js', 'static/x\\y.js']) {
    assert.equal(isSafeOd17AssetPath(value), false);
  }
  assert.deepEqual(
    assertManifestInventory({ manifests: { value: localRow.path }, inventory: [localRow] }),
    [localRow]
  );
  assert.throws(() =>
    assertManifestInventory({
      manifests: { value: localRow.path },
      inventory: [localRow, localRow],
    })
  );
});

test('accepts divergent local and Preview bytes while proving both closures independently', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'od17-size-'));
  t.after(() => fs.rm(root, { recursive: true }));
  const localDir = path.join(root, 'local');
  const evidenceDir = path.join(root, 'evidence');
  const buildBody = `${JSON.stringify({ rootMainFiles: [localRow.path] })}\n`;
  await fs.mkdir(path.join(localDir, 'assets/static/chunks'), { recursive: true });
  await fs.mkdir(evidenceDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(localDir, 'build-manifest.json'), buildBody),
    fs.writeFile(path.join(localDir, 'inventory.json'), `${JSON.stringify([localRow])}\n`),
    fs.writeFile(path.join(localDir, 'assets', localRow.path), localBody),
  ]);
  const structure = `${JSON.stringify({
    headSha: HEAD,
    manifests: { 'build-manifest.json': sha(buildBody) },
    inventory: [localRow],
  })}\n`;
  await fs.writeFile(path.join(evidenceDir, 'local-structure.json'), structure);
  await fs.writeFile(
    path.join(evidenceDir, 'evidence.json'),
    `${JSON.stringify(evidence({ localStructureSha256: sha(structure) }))}\n`
  );
  assert.equal(
    (await verifyOd17Files({ localDir, evidenceDir, expectedHeadSha: HEAD, ...expected })).verdict,
    'pass'
  );
  await fs.writeFile(path.join(localDir, 'assets', localRow.path), 'tampered');
  await assert.rejects(
    () => verifyOd17Files({ localDir, evidenceDir, expectedHeadSha: HEAD }),
    /OD17_LOCAL_ASSET_MISMATCH/u
  );
  await fs.writeFile(path.join(evidenceDir, 'evidence.json'), `${JSON.stringify(evidence({ failureClass: 'provider_failure', recomputedVerdict: 'fail', errorCode: 'OD17_COLLECTOR_FAILED' }))}\n`);
  assert.equal((await verifyOd17Files({ localDir, evidenceDir, expectedHeadSha: HEAD, ...expected })).verdict, 'provider_failure');
});

test('emits only the six canonical verdicts with fail-closed precedence', () => {
  const valid = evidence();
  const low = valid.observations.map(item =>
    withReport(
      { ...item, score: 90 },
      { ...item.report, categories: { performance: { score: 0.9 } } }
    )
  );
  const missing = valid.observations.map(item => ({ ...item, assets: [] }));
  const ambiguous = valid.observations.map(item => withReport(item, { ...item.report, audits: { 'network-requests': { details: { items: [] } } } }));
  // prettier-ignore
  const cases = [
    [valid, 'pass'],
    [{ ...valid, headSha: 'b'.repeat(40) }, 'head_mismatch'],
    [{ ...valid, previewOrigin: 'https://example.com' }, 'target_mismatch'], [{ ...valid, previewOrigin: 'https://interdomestik-web-abc123def-ecohub.vercel.app' }, 'target_mismatch'], [{ ...valid, deploymentRef: 'codex/ida-t115-od17-performance-proof' }, 'target_mismatch'],
    [{ ...valid, observations: missing }, 'measurement_capability_missing'], [{ ...valid, observations: ambiguous }, 'measurement_capability_missing'],
    [{ ...valid, runId: 20 }, 'measurement_capability_missing'],
    [{ ...valid, headSha: 'b'.repeat(40), runId: 20 }, 'measurement_capability_missing'],
    [{ ...valid, observations: valid.observations.map((item, index) => index ? item : withReport(item, { ...item.report, configSettings: { formFactor: 'desktop' } })) }, 'measurement_capability_missing'],
    [{ ...valid, observations: low }, 'budget_failed'],
    [{ ...valid, headSha: 'b'.repeat(40), failureClass: 'provider_failure', recomputedVerdict: 'fail', errorCode: 'OD17_COLLECTOR_FAILED' }, 'provider_failure'],
    [{ ...valid, headSha: 'b'.repeat(40), failureClass: 'measurement_capability_missing', recomputedVerdict: 'fail', errorCode: 'OD17_COLLECTOR_FAILED' }, 'measurement_capability_missing'],
  ];
  for (const [input, verdict] of cases) {
    assert.equal(
      evaluateOd17Evidence({ evidence: input, expectedHeadSha: HEAD, expected }),
      verdict
    );
  }
  assert.deepEqual(
    new Set(cases.map(([, verdict]) => verdict)),
    new Set([
      'pass',
      'head_mismatch',
      'target_mismatch',
      'measurement_capability_missing',
      'budget_failed',
      'provider_failure',
    ])
  );
});
