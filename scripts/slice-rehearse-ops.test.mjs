import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import { buildSafeOperation, runSafeOperation } from './slice-rehearse-ops.mjs';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const tree = 'c'.repeat(40);
const writerMapDigest = 'd'.repeat(64);

function certificate(overrides = {}) {
  const value = {
    schemaVersion: 1,
    certificateId: 'HARNESS-V2-1-CERT-1',
    approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
    sliceId: 'HARNESS-V2-1',
    workClass: 'governance',
    origin: 'https://github.com/interdomestik/interdomestik.git',
    baseSha: base,
    headSha: head,
    treeSha: tree,
    branch: 'codex/harness-v2-1',
    baseBranch: 'main',
    writerMapDigest,
    reportSha256: 'e'.repeat(64),
    expectedRemoteHeadSha: head,
    prNumber: 1700,
    allowedOperations: ['feedback_comment', 'label_add', 'pr_create'],
    artifacts: { 'feedback.md': sha256('feedback'), 'pr.md': sha256('pr body') },
    ...overrides,
  };
  return { value, sha256: sha256(canonicalJson(value)) };
}

function authorityFields(overrides = {}) {
  const cert = certificate(overrides.certificate).value;
  return {
    approvalEnvelopeId: cert.approvalEnvelopeId,
    expectedHeadSha: cert.headSha,
    authorityCertificate: cert,
    authorityCertificateSha256: sha256(canonicalJson(cert)),
    ...overrides.request,
  };
}

const liveFacts = {
  origin: 'https://github.com/interdomestik/interdomestik.git',
  baseSha: base,
  headSha: head,
  treeSha: tree,
  branch: 'codex/harness-v2-1',
  remoteHeadSha: head,
  writerMapDigest,
  pr: {
    number: 1700,
    baseBranch: 'main',
    branch: 'codex/harness-v2-1',
    headSha: head,
    origin: 'interdomestik/interdomestik',
  },
};

const inactiveAuthority = {
  source: 'live-resolver',
  resolverCommand: 'node scripts/lean-current-authority.mjs status',
  resultDigest: '0'.repeat(64),
  lifecycle: 'no_active_slice',
  runtimeAuthorized: false,
  activeSlice: null,
  successorsBlocked: true,
  closeoutAuthorized: false,
  reason: 'deterministic_closeout_recorded',
};

test('builds copy-safe PR, label, feedback, and telemetry argv without a shell', () => {
  const create = buildSafeOperation({
    operation: 'pr_create',
    ...authorityFields({ certificate: { prNumber: null }, request: {} }),
    branch: 'codex/harness-v2-1',
    baseBranch: 'main',
    title: 'feat: harness v2.1',
    bodyArtifact: 'pr.md',
  });
  assert.deepEqual(
    { binary: create.binary, args: create.args, mutating: create.mutating },
    {
      binary: 'gh',
      args: [
        'pr',
        'create',
        '--head',
        'codex/harness-v2-1',
        '--base',
        'main',
        '--title',
        'feat: harness v2.1',
        '--body-file',
        '/private/tmp/interdomestik-harness-operations/pr.md',
      ],
      mutating: true,
    }
  );
  assert.deepEqual(
    buildSafeOperation({
      operation: 'label_add',
      ...authorityFields(),
      prNumber: 1700,
      label: 'full-gate',
    }).args,
    ['pr', 'edit', '1700', '--add-label', 'full-gate']
  );
  assert.deepEqual(
    buildSafeOperation({
      operation: 'feedback_comment',
      ...authorityFields(),
      prNumber: 1700,
      bodyArtifact: 'feedback.md',
    }).args,
    [
      'pr',
      'comment',
      '1700',
      '--body-file',
      '/private/tmp/interdomestik-harness-operations/feedback.md',
    ]
  );
  assert.deepEqual(
    buildSafeOperation({
      operation: 'telemetry_summarize',
      inputPath: '/private/tmp/events.jsonl',
    }),
    {
      binary: process.execPath,
      args: ['scripts/slice-telemetry-v2.mjs', '--input', '/private/tmp/events.jsonl'],
      mutating: false,
    }
  );
  assert.deepEqual(
    buildSafeOperation({
      operation: 'telemetry_record',
      eventPath: '/private/tmp/event.json',
      ledgerPath: '/private/tmp/events.jsonl',
    }),
    {
      binary: process.execPath,
      args: [
        'scripts/slice-telemetry-v2-record.mjs',
        '--event',
        '/private/tmp/event.json',
        '--ledger',
        '/private/tmp/events.jsonl',
      ],
      mutating: false,
    }
  );
});

test('checks exact head before mutation and reconciles a failed writer once', () => {
  const request = {
    operation: 'label_add',
    ...authorityFields(),
    prNumber: 1700,
    label: 'full-gate',
  };
  assert.throws(
    () =>
      runSafeOperation(request, {
        readLiveFacts: () => ({ ...liveFacts, headSha: '9'.repeat(40) }),
        readAuthority: () => inactiveAuthority,
        execute: () => ({ status: 0 }),
      }),
    /exact local head differs/u
  );
  assert.throws(
    () =>
      runSafeOperation(
        {
          operation: 'pr_create',
          ...authorityFields({ certificate: { prNumber: null }, request: {} }),
          branch: 'codex/harness-v2-1',
          baseBranch: 'main',
          title: 'feat: harness v2.1',
          bodyArtifact: 'pr.md',
        },
        {
          readLiveFacts: () => ({ ...liveFacts, remoteHeadSha: '9'.repeat(40), pr: null }),
          readAuthority: () => inactiveAuthority,
        }
      ),
    /remote branch head differs/u
  );
  let reconciliations = 0;
  const result = runSafeOperation(request, {
    readLiveFacts: () => liveFacts,
    readAuthority: () => inactiveAuthority,
    execute: () => ({ status: 1, stderr: 'network failure' }),
    reconcile: () => {
      reconciliations += 1;
      return { outcome: 'not_applied', remoteHeadSha: head };
    },
  });
  assert.equal(result.status, 'failed_not_applied');
  assert.equal(reconciliations, 1);
});

test('rejects shell-shaped or under-specified writer requests', () => {
  assert.throws(
    () =>
      buildSafeOperation({
        operation: 'label_add',
        ...authorityFields({ request: { approvalEnvelopeId: 'x' } }),
        prNumber: 1,
        label: 'full-gate; rm -rf x',
      }),
    /label|envelope/u
  );
  assert.throws(
    () =>
      buildSafeOperation({
        operation: 'feedback_comment',
        ...authorityFields(),
        prNumber: 1,
      }),
    /keys|body/u
  );
});

test('rejects forged certificates, arbitrary local body files, and unavailable live provider facts', () => {
  const request = {
    operation: 'feedback_comment',
    ...authorityFields(),
    prNumber: 1700,
    bodyArtifact: 'feedback.md',
  };
  assert.throws(
    () => buildSafeOperation({ ...request, authorityCertificateSha256: '0'.repeat(64) }),
    /certificate digest differs/u
  );
  assert.throws(
    () => buildSafeOperation({ ...request, bodyArtifact: '/etc/passwd' }),
    /artifact path is unsafe/u
  );
  assert.throws(
    () =>
      runSafeOperation(request, {
        readLiveFacts: () => null,
        readAuthority: () => inactiveAuthority,
      }),
    /live operation facts are unavailable/u
  );
});

test('preserves unknown failed-mutation reconciliation instead of claiming success', () => {
  const request = {
    operation: 'label_add',
    ...authorityFields(),
    prNumber: 1700,
    label: 'full-gate',
  };
  const result = runSafeOperation(request, {
    readLiveFacts: () => liveFacts,
    readAuthority: () => inactiveAuthority,
    execute: () => ({ status: 1, stderr: 'transport timeout' }),
    reconcile: () => ({ outcome: 'unknown' }),
  });
  assert.equal(result.status, 'failed_unknown');
  assert.equal(result.reconciliation.outcome, 'unknown');
});
