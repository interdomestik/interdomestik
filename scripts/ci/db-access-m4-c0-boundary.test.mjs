import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as bootstrap from './p2/bootstrap.mjs';
import { runFixedM4P2 } from './db-access-m4-p2-ordinary.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { artifactFixture } from './db-access-m4-p2-c0-purpose.fixture.mjs';
import { verifyOrdinaryProvenance, verifyM4C0UnitProvenance } from './p2/ordinary-provenance.mjs';

const context = {
  repository: 'interdomestik/interdomestik',
  eventName: 'pull_request',
  headCommit: 'a'.repeat(40),
  candidateCommit: 'b'.repeat(40),
};
function metadata() {
  return {
    context,
    runId: 1,
    attempt: 2,
    run: {
      id: 1,
      run_attempt: 2,
      event: 'pull_request',
      status: 'completed',
      conclusion: 'failure',
      path: '.github/workflows/ci.yml',
      repository: { full_name: context.repository },
      head_repository: { full_name: context.repository },
      head_sha: context.headCommit,
      run_started_at: '2026-10-27T00:00:00Z',
    },
    job: { run_id: 1, run_attempt: 2, name: 'unit', status: 'completed', conclusion: 'success' },
    artifact: {
      id: 3,
      name: 'ordinary-coverage-2-' + context.candidateCommit,
      expired: false,
      workflow_run: { id: 1, head_sha: context.headCommit },
      digest: 'sha256:' + 'c'.repeat(64),
      size_in_bytes: 10,
      created_at: '2026-10-27T00:01:00Z',
    },
  };
}
for (const verify of [verifyOrdinaryProvenance, verifyM4C0UnitProvenance])
  test(verify.name + ' refuses running-then-cancelled workflow before coverage can be used', () => {
    const input = metadata();
    input.run.status = 'in_progress';
    input.run.conclusion = null;
    assert.throws(() => verify(input));
    input.run.status = 'completed';
    input.run.conclusion = 'cancelled';
    assert.throws(() => verify(input));
  });

test('successful-unit metadata cannot mint any actual private bootstrap capability', () => {
  const input = metadata(),
    value = verifyM4C0UnitProvenance(input);
  for (const copy of [
    value,
    structuredClone(value),
    { ...value, protectedAuthorityAccepted: true },
  ]) {
    assert.throws(
      () => bootstrap.takeM4C0BootstrapInvocation(copy),
      /private authenticated purpose/
    );
    assert.throws(
      () => bootstrap.consumeM4C0ArtifactAuthority(copy, context),
      /fresh M4 C0 artifact/
    );
    assert.throws(
      () => bootstrap.takeBootstrappedM4C0CoverageForJoin(copy, context),
      /fresh bootstrapped result/
    );
  }
});

test('actual source-tree authentication refuses despite otherwise acceptable coverage metadata', async () => {
  verifyM4C0UnitProvenance(metadata());
  const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
  const git = args =>
    execFileSync('/usr/bin/git', args, {
      cwd: root,
      env: { PATH: '/usr/bin:/bin', GIT_NO_REPLACE_OBJECTS: '1' },
      encoding: 'utf8',
    }).trim();
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-c0-auth-unit-')));
  const candidateRoot = path.join(temp, 'candidate'),
    outputRoot = path.join(temp, 'output');
  fs.mkdirSync(candidateRoot);
  fs.mkdirSync(outputRoot);
  try {
    await assert.rejects(
      bootstrap.runBootstrappedM4C0Coverage({
        producerRoot: root,
        candidateRoot,
        outputRoot,
        gitDir: git(['rev-parse', '--absolute-git-dir']),
        context: {
          ...context,
          sourceCommit: git(['rev-parse', 'HEAD']),
          sourceTree: '0'.repeat(40),
        },
      }),
      /unprotected source commit\/tree/
    );
  } finally {
    fs.rmSync(temp, { recursive: true });
  }
});

test('actual private M4 adapter refuses a copied policy before any artifact or P2 execution', async () => {
  verifyM4C0UnitProvenance(metadata());
  const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
  await assert.rejects(
    runFixedM4P2({ producer: root, context, policy: structuredClone(PROVIDER_UNIT_POLICY) }),
    /fixed producer\/policy required/
  );
});

test('failed-audit artifact remains coverage-only and never claims hosted protected authority', async () => {
  // Explicit unit-only lexical authority/API doubles; no real capability, GitHub or network proof.
  const input = metadata(),
    zip = Buffer.from('bounded artifact-fetch unit bytes');
  input.artifact.digest = 'sha256:' + createHash('sha256').update(zip).digest('hex');
  input.artifact.size_in_bytes = zip.length;
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-c0-fetch-unit-')));
  const originalFetch = globalThis.fetch;
  const calls = [],
    marker = Object.freeze({});
  const reader = artifactFixture({
    fs,
    path,
    createHash,
    verifyOrdinaryProvenance,
    verifyM4C0UnitProvenance,
    consumeM4C0ArtifactAuthority(authority, observed) {
      assert.equal(authority, marker);
      assert.equal(observed, context);
    },
  });
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/attempts/2/jobs'))
      return new Response(
        JSON.stringify({
          total_count: 2,
          jobs: [
            input.job,
            {
              run_id: 1,
              run_attempt: 2,
              name: 'audit',
              status: 'completed',
              conclusion: 'failure',
              steps: [
                {
                  name: 'Protected base DB access guard',
                  status: 'completed',
                  conclusion: 'failure',
                },
              ],
            },
          ],
        })
      );
    if (String(url).endsWith('/attempts/2')) return new Response(JSON.stringify(input.run));
    if (String(url).includes('/artifacts?'))
      return new Response(
        JSON.stringify({
          total_count: 1,
          artifacts: [input.artifact],
        })
      );
    if (String(url).endsWith('/artifacts/3/zip'))
      return new Response(null, {
        status: 302,
        headers: { location: 'https://unit.blob.core.windows.net/ordinary.zip' },
      });
    assert.equal(String(url), 'https://unit.blob.core.windows.net/ordinary.zip');
    assert.equal(options.headers, undefined);
    return new Response(zip);
  };
  try {
    const identity = await reader.fetchM4C0OrdinaryCoverageArtifact(
      { ...input, token: 'explicit-unit-double', outputDirectory: path.join(temp, 'download') },
      marker
    );
    assert.equal(identity.hostedProtectedAuthorityAccepted, false);
    assert.equal(identity.globalGuardVerdictAccepted, false);
    assert.equal(identity.ordinaryCoverageIsUntrusted, true);
    assert.equal(identity.workflowConclusion, 'failure');
    assert.equal(identity.nativeAdmission, false);
    assert.equal(calls.length, 5);
    assert.throws(() => bootstrap.consumeM4C0ArtifactAuthority(identity, context));
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(temp, { recursive: true });
  }
});
