import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import { operationApprovalBinding } from './slice-rehearse-operation-certificate.mjs';
import * as live from './slice-rehearse-operation-live.mjs';
import { buildSafeOperation, runSafeOperation } from './slice-rehearse-ops.mjs';

const [head, base, tree] = ['a', 'b', 'c'].map(value => value.repeat(40));
const writerMapDigest = 'd'.repeat(64);
const origin = 'https://github.com/interdomestik/interdomestik.git';
const [branch, baseBranch] = ['codex/harness-v2-1', 'main'];
const [prNumber, build] = [1700, buildSafeOperation];

function certificate(overrides = {}) {
  const rehearsalReport = {
    schemaVersion: 1,
    sliceId: 'HARNESS-V2-1',
    repository: { origin, baseSha: base, headSha: head, treeSha: tree },
    writers: { digest: writerMapDigest },
    authorityStops: [],
    operationalEnvelope: { authorityGranted: false },
    reportSha256: null,
  };
  rehearsalReport.reportSha256 = sha256(canonicalJson(rehearsalReport));
  const value = {
    schemaVersion: 1,
    certificateId: 'HARNESS-V2-1-CERT-1',
    approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
    sliceId: 'HARNESS-V2-1',
    workClass: 'governance',
    origin,
    baseSha: base,
    headSha: head,
    treeSha: tree,
    branch,
    baseBranch,
    writerMapDigest,
    reportSha256: rehearsalReport.reportSha256,
    rehearsalReport,
    expectedRemoteHeadSha: head,
    prNumber,
    allowedOperations: ['conditional_merge', 'feedback_comment', 'label_add', 'pr_create'],
    artifacts: { 'feedback.md': sha256('feedback'), 'pr.md': sha256('pr body') },
    ...overrides,
  };
  value.approvalBindingSha256 = operationApprovalBinding(value);
  return value;
}

function authorityFields(overrides = {}) {
  const cert = certificate(overrides.certificate);
  return {
    approvalEnvelopeId: cert.approvalEnvelopeId,
    expectedHeadSha: cert.headSha,
    authorityCertificate: cert,
    authorityCertificateSha256: sha256(canonicalJson(cert)),
    ...overrides.request,
  };
}

const liveFacts = {
  origin,
  baseSha: base,
  headSha: head,
  treeSha: tree,
  branch,
  remoteHeadSha: head,
  writerMapDigest,
  pr: {
    number: prNumber,
    baseBranch,
    branch,
    headSha: head,
    origin: 'interdomestik/interdomestik',
  },
};

const inactiveAuthority = { source: 'live-resolver', runtimeAuthorized: false, activeSlice: null };

test('bounds git auth environment', () => {
  const env = { HOME: '/u', XDG_CONFIG_HOME: '/x', SSH_AUTH_SOCK: '/s', GH_TOKEN: 't' };
  const PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
  assert.deepEqual(live.execOptions('gh', env).env, { PATH, HOME: '/u', XDG_CONFIG_HOME: '/x', GH_TOKEN: 't' });
  assert.deepEqual(live.execOptions('/usr/bin/git', env).env, { PATH, HOME: '/u', XDG_CONFIG_HOME: '/x', SSH_AUTH_SOCK: '/s', GIT_TERMINAL_PROMPT: '0' });
  const repo = live.normalizeHeadRepository({ name: 'r' }, { login: 'o' });
  assert.equal(repo, 'o/r');
});
test('builds shell-free operation argv', () => {
  const create = build({
    operation: 'pr_create',
    ...authorityFields({ certificate: { prNumber: null }, request: {} }),
    branch,
    baseBranch,
    title: 'feat: harness v2.1',
    bodyArtifact: 'pr.md',
  });
  assert.equal(create.binary, 'gh');
  assert.equal(create.mutating, true);
  assert.deepEqual(create.args.slice(0, 6), ['pr', 'create', '--head', branch, '--base', 'main']);
  assert.match(create.args.at(-1), /\/\.cache\/interdomestik-harness-operations\/pr\.md$/u);
  assert.deepEqual(
    build({
      operation: 'label_add',
      ...authorityFields(),
      prNumber,
      label: 'full-gate',
    }).args,
    ['pr', 'edit', '1700', '--add-label', 'full-gate']
  );
  const feedback = build({
    operation: 'feedback_comment',
    ...authorityFields(),
    prNumber,
    bodyArtifact: 'feedback.md',
  });
  assert.deepEqual(feedback.args.slice(0, 4), ['pr', 'comment', '1700', '--body-file']);
  assert.match(feedback.args.at(-1), /\/\.cache\/interdomestik-harness-operations\/feedback\.md$/u);
  assert.deepEqual(build({ operation: 'conditional_merge', ...authorityFields(), prNumber }).args, [
    'pr',
    'merge',
    '1700',
    '--squash',
    '--match-head-commit',
    head,
  ]);
  assert.deepEqual(
    build({
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
    build({
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
test('checks head and reconciles a failed writer', () => {
  const request = {
    operation: 'label_add',
    ...authorityFields(),
    prNumber,
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
          branch,
          baseBranch,
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
test('updates an exact PR from its remote preimage', () => {
  const oldHead = '8'.repeat(40);
  const request = {
    operation: 'branch_push',
    ...authorityFields({
      certificate: {
        expectedRemoteHeadSha: oldHead,
        allowedOperations: ['branch_push'],
      },
    }),
    branch,
  };
  const result = runSafeOperation(request, {
    readLiveFacts: () => ({
      ...liveFacts,
      remoteHeadSha: oldHead,
      pr: { ...liveFacts.pr, headSha: oldHead },
    }),
    readAuthority: () => inactiveAuthority,
    execute: () => ({ status: 0 }),
    reconcile: () => ({ outcome: 'applied', remoteHeadSha: head }),
  });
  assert.equal(result.status, 'succeeded');
});
test('rejects unsafe or incomplete writer requests', () => {
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
test('rejects forged or incomplete facts', () => {
  const request = {
    operation: 'feedback_comment',
    ...authorityFields(),
    prNumber,
    bodyArtifact: 'feedback.md',
  };
  assert.throws(
    () => buildSafeOperation({ ...request, authorityCertificateSha256: '0'.repeat(64) }),
    /certificate digest differs/u
  );
  const tamperedReport = structuredClone(request.authorityCertificate);
  tamperedReport.rehearsalReport.repository.headSha = '9'.repeat(40);
  assert.throws(
    () =>
      buildSafeOperation({
        ...request,
        authorityCertificate: tamperedReport,
        authorityCertificateSha256: sha256(canonicalJson(tamperedReport)),
      }),
    /report digest|candidate identity/u
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

test('preserves unknown mutation reconciliation', () => {
  const request = {
    operation: 'label_add',
    ...authorityFields(),
    prNumber,
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
