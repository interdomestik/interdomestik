import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import { operationApprovalBinding } from './slice-rehearse-operation-certificate.mjs';
import * as live from './slice-rehearse-operation-live.mjs';
import { buildSafeOperation, runSafeOperation } from './slice-rehearse-ops.mjs';

const [head, base, tree] = ['a', 'b', 'c'].map(value => value.repeat(40));
const writerMapDigest = 'd'.repeat(64);
const approvalReceiptSha256 = 'e'.repeat(64);
const outcomeRiskSha256 = 'f'.repeat(64);
const writerClosure = ['scripts/a.mjs'];
const origin = 'https://github.com/interdomestik/interdomestik.git';
const [branch, baseBranch] = ['codex/harness-v2-1', 'main'];
const [prNumber, build] = [1700, buildSafeOperation];

function certificate(overrides = {}) {
  const approvedPrNumber = Object.hasOwn(overrides, 'prNumber') ? overrides.prNumber : prNumber;
  const approvedBranch = overrides.branch ?? branch;
  const rehearsalReport = {
    schemaVersion: 1,
    sliceId: 'HARNESS-V2-1',
    repository: { origin, baseSha: base, headSha: head, treeSha: tree },
    writers: { digest: writerMapDigest },
    authorityStops: [],
    operationalEnvelope: {
      authorityGranted: false,
      branch: approvedBranch,
      outcomeRiskSha256: overrides.outcomeRiskSha256 ?? outcomeRiskSha256,
      prNumber: approvedPrNumber,
      writerClosure: overrides.writerClosure ?? writerClosure,
    },
    reportSha256: null,
  };
  rehearsalReport.reportSha256 = sha256(canonicalJson(rehearsalReport));
  const value = {
    schemaVersion: 1,
    certificateId: 'HARNESS-V2-1-CERT-1',
    approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
    approvalReceiptSha256,
    sliceId: 'HARNESS-V2-1',
    workClass: 'governance',
    origin,
    outcomeRiskSha256,
    baseSha: base,
    headSha: head,
    treeSha: tree,
    writerClosure,
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
  assert.deepEqual(live.execOptions('gh', env).env, {
    PATH,
    HOME: '/u',
    XDG_CONFIG_HOME: '/x',
    GH_TOKEN: 't',
  });
  assert.deepEqual(live.execOptions('/usr/bin/git', env).env, {
    PATH,
    HOME: '/u',
    XDG_CONFIG_HOME: '/x',
    SSH_AUTH_SOCK: '/s',
    GIT_TERMINAL_PROMPT: '0',
  });
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
