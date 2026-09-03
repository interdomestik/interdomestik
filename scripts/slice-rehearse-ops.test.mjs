import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import { operationApprovalBinding } from './slice-rehearse-operation-certificate.mjs';
import * as live from './slice-rehearse-operation-live.mjs';
import {
  acquireHeavyProofExecutionLease as acquireLease,
  approvalReceiptPath,
  buildSafeOperation,
  heavyProofLedgerPath,
  recordHeavyProofExecution as recordProof,
  runSafeOperation,
} from './slice-rehearse-ops.mjs';

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
    reportSha256: null,
    operationalEnvelope: {
      writerClosure: overrides.writerClosure ?? writerClosure,
      prNumber: approvedPrNumber,
      outcomeRiskSha256: overrides.outcomeRiskSha256 ?? outcomeRiskSha256,
      branch: approvedBranch,
      authorityGranted: false,
    },
    authorityStops: [],
    writers: { digest: writerMapDigest },
    repository: { treeSha: tree, headSha: head, baseSha: base, origin },
    sliceId: 'HARNESS-V2-1',
    schemaVersion: 1,
  };
  rehearsalReport.reportSha256 = sha256(canonicalJson(rehearsalReport));
  const value = {
    artifacts: { 'feedback.md': sha256('feedback'), 'pr.md': sha256('pr body') },
    allowedOperations: ['conditional_merge', 'feedback_comment', 'label_add', 'pr_create'],
    prNumber,
    expectedRemoteHeadSha: head,
    rehearsalReport,
    reportSha256: rehearsalReport.reportSha256,
    writerMapDigest,
    mergeMethod: 'squash',
    baseBranch,
    branch,
    writerClosure,
    treeSha: tree,
    headSha: head,
    baseSha: base,
    outcomeRiskSha256,
    origin,
    workClass: 'governance',
    sliceId: 'HARNESS-V2-1',
    approvalReceiptSha256,
    approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-1',
    certificateId: 'HARNESS-V2-1-CERT-1',
    schemaVersion: 1,
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
test('binds conditional merge to live repository merge settings', () => {
  const request = {
    operation: 'conditional_merge',
    ...authorityFields(),
    prNumber,
  };
  assert.throws(
    () =>
      live.verifyLiveOperationFacts(
        { ...liveFacts, mergeAllowed: false },
        request.authorityCertificate,
        request.operation
      ),
    /merge method is not enabled/u
  );
  assert.doesNotThrow(() =>
    live.verifyLiveOperationFacts(
      { ...liveFacts, mergeAllowed: true },
      request.authorityCertificate,
      request.operation
    )
  );
  for (const mergeMethod of ['merge', 'rebase'])
    assert.throws(
      () =>
        build({
          operation: 'conditional_merge',
          ...authorityFields({ certificate: { mergeMethod } }),
          prNumber,
        }),
      /merge method is invalid/u
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
      live.verifyLiveOperationFacts(
        { ...liveFacts, headSha: '9'.repeat(40) },
        request.authorityCertificate,
        request.operation
      ),
    /exact local head differs/u
  );
  assert.throws(
    () =>
      live.verifyLiveOperationFacts(
        { ...liveFacts, remoteHeadSha: '9'.repeat(40), pr: null },
        certificate({ prNumber: null }),
        'pr_create'
      ),
    /remote branch head differs/u
  );
  assert.throws(() => runSafeOperation(request), /approval receipt/u);
});
test('releases a failed unapplied operation but retains uncertain consumption', () => {
  const approval = 'retryable approval\n';
  const request = {
    operation: 'label_add',
    ...authorityFields({ certificate: { approvalReceiptSha256: sha256(approval) } }),
    prNumber,
    label: 'full-gate',
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-operation-retry-'));
  fs.writeFileSync(approvalReceiptPath(request.authorityCertificate, root), approval, {
    mode: 0o600,
  });
  const options = {
    root,
    readLiveFacts: () => liveFacts,
    readAuthority: () => ({ source: 'live-resolver', runtimeAuthorized: false, activeSlice: null }),
    execute: () => ({ status: 1, stderr: 'failed' }),
    reconcile: () => ({ outcome: 'not_applied' }),
  };
  assert.equal(runSafeOperation(request, options).status, 'failed_not_applied');
  assert.equal(
    fs.readdirSync(root).some(name => name.endsWith('.consumed')),
    false
  );
  options.reconcile = () => ({ outcome: 'unknown' });
  assert.equal(runSafeOperation(request, options).status, 'failed_unknown');
  assert.equal(
    fs.readdirSync(root).some(name => name.endsWith('.consumed')),
    true
  );
  fs.rmSync(root, { recursive: true, force: true });
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
  assert.doesNotThrow(() =>
    live.verifyLiveOperationFacts(
      { ...liveFacts, remoteHeadSha: oldHead, pr: { ...liveFacts.pr, headSha: oldHead } },
      request.authorityCertificate,
      request.operation
    )
  );
});
test('fails closed over proof receipt completion and execution identities', t => {
  const scope = { sliceId: 'HARNESS-V2-OPS', headSha: head, treeSha: tree };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-ops-'));
  const ledger = heavyProofLedgerPath(scope, root);
  const at = '2026-09-02T00:00:00.000Z';
  const ctx = { ledgerPath: ledger, scope, ledgerRoot: root };
  const baseProof = { lane: 'pr-e2e', startedAt: at };
  const proof = (key, runId) => ({ ...baseProof, evidenceKey: key.repeat(64), runId });
  const record = (execution, finishedAt, status = 'succeeded', exitCode = 0) =>
    recordProof({ ...ctx, execution, status, finishedAt, exitCode });
  const lease = execution => acquireLease({ ...ctx, execution });
  const reject = execution => assert.throws(() => lease(execution)(), /already succeeded/u);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => record(proof('1', 'run-1'), 'bad', 'running', null), /completion invalid/u);
  assert.throws(() => record(proof('2', 'run-2'), 0), /completion invalid/u);
  assert.equal(record({ ...proof('3', 'run-3'), startedAt: 0 }, at), true);
  assert.throws(() => record(proof('4', 'run-3'), at), /receipt transition/u);
  reject(proof('5', 'run-3'));
  reject(proof('3', 'run-4'));
  assert.equal(record(proof('6', 'run-5'), at, 'failed', null), true);
  fs.truncateSync(ledger, fs.statSync(ledger).size - 1);
  assert.throws(() => record(proof('6', 'run-6'), at), /ledger incomplete/u);
  fs.appendFileSync(ledger, '\n');
  reject(proof('7', 'run-5'));
  lease(proof('6', 'run-6'))();
  assert.equal(record(proof('6', 'run-6'), at), true);
  reject(proof('6', 'run-7'));
});
