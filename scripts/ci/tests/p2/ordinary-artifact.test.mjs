import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseUntrustedJSON,
  normalizeOrdinaryCoverage,
  expectedCoverageFiles,
  verifyOrdinaryProvenance,
  validateSummary,
} from '../../p2/ordinary-artifact.mjs';
const context = {
  eventName: 'pull_request',
  headCommit: 'a'.repeat(40),
  candidateCommit: 'b'.repeat(40),
};
const metadata = {
  context,
  runId: 123,
  attempt: 2,
  run: {
    id: 123,
    run_attempt: 2,
    event: 'pull_request',
    status: 'in_progress',
    conclusion: null,
    path: '.github/workflows/ci.yml',
    repository: { full_name: 'interdomestik/interdomestik' },
    head_repository: { full_name: 'interdomestik/interdomestik' },
    head_sha: context.headCommit,
    run_started_at: '2026-10-26T10:00:00Z',
  },
  job: { run_id: 123, run_attempt: 2, name: 'unit', status: 'completed', conclusion: 'success' },
  artifact: {
    id: 321,
    name: 'ordinary-coverage-2-' + context.candidateCommit,
    expired: false,
    workflow_run: { id: 123, head_sha: context.headCommit },
    digest: 'sha256:' + 'c'.repeat(64),
    size_in_bytes: 100,
    created_at: '2026-10-26T10:01:00Z',
  },
};
test('completed ordinary job is usable while other jobs remain running', () =>
  assert.equal(verifyOrdinaryProvenance(metadata).artifactId, 321));
const changes = {
  oldAttempt: v => (v.job.run_attempt = 1),
  failedJob: v => (v.job.conclusion = 'failure'),
  unfinishedJob: v => (v.job.status = 'in_progress'),
  wrongWorkflow: v => (v.run.path = '.github/workflows/foreign.yml'),
  foreignHead: v => (v.run.head_sha = 'd'.repeat(40)),
  foreignRepo: v => (v.run.repository.full_name = 'other/repo'),
  oldMergeArtifact: v => (v.artifact.name = 'ordinary-coverage-2-' + 'd'.repeat(40)),
  expired: v => (v.artifact.expired = true),
  oldArtifact: v => (v.artifact.created_at = '2026-10-25T10:00:00Z'),
  invalidDate: v => (v.artifact.created_at = 'invalid'),
  invalidDigest: v => (v.artifact.digest = 'sha256:invalid'),
  oversize: v => (v.artifact.size_in_bytes = 33 * 1024 * 1024),
  foreignRun: v => (v.artifact.workflow_run.id = 555),
  nonNumericId: v => (v.artifact.id = '../foreign'),
};
for (const [name, mutate] of Object.entries(changes))
  test('reject provenance ' + name, () => {
    const value = structuredClone(metadata);
    mutate(value);
    assert.throws(() => verifyOrdinaryProvenance(value));
  });
for (const key of ['__proto__', 'constructor', 'prototype'])
  test('reject nested prototype key ' + key, () =>
    assert.throws(
      () => parseUntrustedJSON(Buffer.from('{"nested":{"' + key + '":{}}}')),
      /prototype key/
    )
  );
test('malformed JSON rejected', () => assert.throws(() => parseUntrustedJSON(Buffer.from('{'))));
test('JSON byte cap before parse', () =>
  assert.throws(() => parseUntrustedJSON(Buffer.alloc(100), 10), /byte cap/));
test('finite exact package file list', () => {
  const files = expectedCoverageFiles(['domain-users']);
  assert.equal(files.length, 5);
  assert.throws(() => expectedCoverageFiles(['../../foreign']));
  assert.throws(() => expectedCoverageFiles(['domain-users', 'domain-users']));
});
test('absolute/traversal/foreign/source-symlink coverage refused', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p2-paths-')));
  try {
    const name = 'apps/web/src/example.ts';
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), 'export {};');
    const normalize = (
      file,
      row = { path: file, statementMap: {}, fnMap: {}, branchMap: {}, s: {}, f: {}, b: {} }
    ) =>
      normalizeOrdinaryCoverage({
        bytes: Buffer.from(JSON.stringify({ [file]: row })),
        candidateRoot: root,
        allowedSourceFiles: [name],
      });
    assert.ok(normalize(name)[path.join(root, name)]);
    for (const file of ['/etc/passwd', '../private.ts', 'apps/web/src/foreign.ts'])
      assert.throws(() => normalize(file), /foreign coverage path/);
    fs.unlinkSync(path.join(root, name));
    fs.symlinkSync('/etc/hosts', path.join(root, name));
    assert.throws(() => normalize(name), /source symlink/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('invalid summary counts refused', () => {
  const metric = { total: 10, covered: 11, skipped: 0, pct: 100 };
  assert.throws(
    () =>
      validateSummary(
        Buffer.from(
          JSON.stringify({
            total: Object.fromEntries(
              ['lines', 'statements', 'functions', 'branches'].map(k => [k, metric])
            ),
          })
        )
      ),
    /summary/
  );
});
