import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import { operationApprovalBinding } from './slice-rehearse-operation-certificate.mjs';
import * as live from './slice-rehearse-operation-live.mjs';
import {
  approvalReceiptPath,
  buildSafeOperation,
  consumeApprovedOperation,
  runSafeOperation,
  verifyTrustedApprovalReceipt,
} from './slice-rehearse-ops.mjs';

const [head, base, tree] = ['a', 'b', 'c'].map(value => value.repeat(40));
const writerMapDigest = 'd'.repeat(64);
const APPROVAL = 'trusted approval receipt\n';
const approvalReceiptSha256 = sha256(APPROVAL);
const outcomeRiskSha256 = 'f'.repeat(64);
const writerClosure = ['scripts/a.mjs'];
const origin = 'https://github.com/interdomestik/interdomestik.git';
const [branch, baseBranch] = ['codex/harness-v2-1', 'main'];
const prNumber = 1700;

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
    allowedOperations: ['conditional_merge', 'feedback_comment', 'label_add'],
    artifacts: { 'feedback.md': sha256('feedback') },
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
    () => buildSafeOperation({ operation: 'feedback_comment', ...authorityFields(), prNumber: 1 }),
    /keys|body/u
  );
});

test('rejects shadow delivery approval envelopes', () => {
  for (const approvalEnvelopeId of [
    'HARNESS-V2-1-REVIEW-FIX-1',
    'HARNESS-V2-1-ULTRA-REMEDIATION-1',
  ]) {
    const authorityCertificate = certificate({ approvalEnvelopeId });
    assert.throws(
      () =>
        buildSafeOperation({
          operation: 'label_add',
          ...authorityFields({
            certificate: authorityCertificate,
            request: { approvalEnvelopeId },
          }),
          prNumber,
          label: 'full-gate',
        }),
      /delivery approval envelope/u
    );
  }
});

test('binds approval to outcome, branch, PR, and closure while allowing SHA rebinding', () => {
  const approved = certificate();
  const rebound = {
    ...approved,
    headSha: '8'.repeat(40),
    treeSha: '9'.repeat(40),
    reportSha256: '1'.repeat(64),
  };
  assert.equal(operationApprovalBinding(rebound), approved.approvalBindingSha256);
  for (const drift of [
    { branch: 'codex/other' },
    { prNumber: 1701 },
    { sliceId: 'HARNESS-V2-X' },
    { workClass: 'product' },
    { outcomeRiskSha256: '0'.repeat(64) },
    { writerClosure: ['scripts/b.mjs'] },
  ])
    assert.notEqual(
      operationApprovalBinding({ ...approved, ...drift }),
      approved.approvalBindingSha256
    );
});

test('rejects a self-minted certificate without trusted approval provenance', () => {
  const request = {
    operation: 'label_add',
    ...authorityFields({ certificate: { approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-9999' } }),
    prNumber,
    label: 'full-gate',
  };
  assert.throws(
    () =>
      runSafeOperation(request, {
        readLiveFacts: () => liveFacts,
        readAuthority: () => inactiveAuthority,
      }),
    /approval receipt/u
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trusted-harness-approval-'));
  const receipt = approvalReceiptPath(request.authorityCertificate, root);
  fs.writeFileSync(receipt, APPROVAL, { mode: 0o600 });
  assert.equal(verifyTrustedApprovalReceipt(request.authorityCertificate, root), true);
  const marker = consumeApprovedOperation(request, request.authorityCertificate, root);
  assert.equal(fs.readFileSync(marker, 'utf8'), `${sha256(canonicalJson(request))}\n`);
  assert.throws(
    () => consumeApprovedOperation(request, request.authorityCertificate, root),
    /EEXIST/u
  );
  fs.writeFileSync(receipt, 'forged\n', { mode: 0o600 });
  assert.throws(
    () => verifyTrustedApprovalReceipt(request.authorityCertificate, root),
    /digest differs/u
  );
  fs.rmSync(root, { recursive: true, force: true });
  const authorityCertificate = { ...request.authorityCertificate };
  delete authorityCertificate.approvalReceiptSha256;
  assert.throws(
    () =>
      buildSafeOperation({
        ...request,
        authorityCertificate,
        authorityCertificateSha256: sha256(canonicalJson(authorityCertificate)),
      }),
    /keys|approval receipt/u
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
    () => live.verifyLiveOperationFacts(null, request.authorityCertificate, request.operation),
    /live operation facts are unavailable/u
  );
});

test('does not execute a mutation before trusted approval is proven', () => {
  const request = {
    operation: 'label_add',
    ...authorityFields({ certificate: { approvalEnvelopeId: 'HARNESS-V2-1-DELIVERY-9998' } }),
    prNumber,
    label: 'full-gate',
  };
  let executed = false;
  assert.throws(
    () => runSafeOperation(request, { execute: () => (executed = true) }),
    /approval receipt/u
  );
  assert.equal(executed, false);
});

test('merge reconciliation binds exact parent, tree, main, PR, and Lean consumption', () => {
  const authorityCertificate = certificate();
  const mergeSha = '9'.repeat(40);
  const facts = {
    mainSha: mergeSha,
    authority: { lifecycle: 'consumed_on_merge', mergeSha },
    pull: {
      state: 'MERGED',
      merged: true,
      baseRefName: baseBranch,
      headRefName: branch,
      headRefOid: head,
      mergeCommit: {
        oid: mergeSha,
        tree: { oid: tree },
        parents: { totalCount: 1, nodes: [{ oid: base }] },
      },
    },
  };
  assert.deepEqual(live.classifyMergeReconciliation(facts, authorityCertificate), {
    outcome: 'applied',
    mergeSha,
  });
  for (const changed of [
    { ...facts, mainSha: '0'.repeat(40) },
    { ...facts, authority: { lifecycle: 'active_implementation', mergeSha } },
    {
      ...facts,
      pull: {
        ...facts.pull,
        mergeCommit: { ...facts.pull.mergeCommit, tree: { oid: '0'.repeat(40) } },
      },
    },
  ])
    assert.equal(
      live.classifyMergeReconciliation(changed, authorityCertificate).outcome,
      'unknown'
    );
  assert.equal(
    live.classifyMergeReconciliation({ pull: { state: 'OPEN' } }, authorityCertificate).outcome,
    'not_applied'
  );
});
