import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson, sha256 } from './slice-rehearse-canonical.mjs';
import { operationApprovalBinding } from './slice-rehearse-operation-certificate.mjs';

export const digest = value => sha256(canonicalJson(value));
export const sha = value => value.repeat(40);
export const receipt = 'isolated recovery approval\n';
export const materials = Object.fromEntries(
  'dependencies policyTrust callerClosure approval scopeRisk capacityInventory capacityBudget capacityOwners plannedCandidate protection requiredContextsApps mergeMode eligibility proofInputs'
    .split(' ')
    .map(key => [key, digest(key)])
);

export function operationRequest(base = sha('b'), head = sha('a'), overrides = {}) {
  const c = {
    schemaVersion: 1,
    certificateId: 'RECOVERY-1-CERT-1',
    approvalEnvelopeId: 'RECOVERY-1-DELIVERY-1',
    approvalReceiptSha256: sha256(receipt),
    sliceId: 'RECOVERY-1',
    workClass: 'product',
    origin: 'https://github.com/interdomestik/interdomestik.git',
    outcomeRiskSha256: digest('risk'),
    baseSha: base,
    headSha: head,
    treeSha: sha('c'),
    writerClosure: ['scripts/a.mjs'],
    branch: 'codex/recovery-1',
    baseBranch: 'main',
    mergeMethod: 'squash',
    writerMapDigest: digest(['scripts/a.mjs']),
    expectedRemoteHeadSha: head,
    prNumber: 1700,
    allowedOperations: ['conditional_merge'],
    artifacts: {},
    ...overrides,
  };
  c.certificateId = `${c.sliceId}-CERT-1`;
  c.approvalEnvelopeId = `${c.sliceId}-DELIVERY-1`;
  const report = {
    schemaVersion: 1,
    sliceId: c.sliceId,
    repository: { origin: c.origin, baseSha: base, headSha: head, treeSha: c.treeSha },
    writers: { digest: c.writerMapDigest },
    authorityStops: [],
    operationalEnvelope: {
      authorityGranted: false,
      branch: c.branch,
      outcomeRiskSha256: c.outcomeRiskSha256,
      prNumber: c.prNumber,
      writerClosure: c.writerClosure,
    },
    reportSha256: null,
  };
  report.reportSha256 = digest(report);
  Object.assign(c, {
    rehearsalReport: report,
    reportSha256: report.reportSha256,
    approvalBindingSha256: operationApprovalBinding(c),
  });
  return {
    operation: 'conditional_merge',
    prNumber: c.prNumber,
    approvalEnvelopeId: c.approvalEnvelopeId,
    expectedHeadSha: head,
    authorityCertificate: c,
    authorityCertificateSha256: digest(c),
  };
}

export function observation(execution, overrides = {}) {
  return {
    schemaVersion: 1,
    complete: true,
    origin: 'https://github.com/interdomestik/interdomestik.git',
    sliceId: 'RECOVERY-1',
    promotionSha: sha('2'),
    protectedMainSha: execution.baseSha,
    execution,
    promotionIsAncestor: true,
    baseIsAncestor: true,
    scopeSha256: digest('scope'),
    expectedMaterial: { ...materials },
    material: { ...materials },
    approval: {
      valid: true,
      generation: 1,
      receiptSha256: sha256(receipt),
      bindingSha256: digest('binding'),
      semanticSha256: digest('semantic'),
    },
    proof: { passed: true, identitySha256: digest(execution) },
    ...overrides,
  };
}

export function isolatedRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-contract-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

export function liveFacts(c) {
  return {
    origin: c.origin,
    baseSha: c.baseSha,
    headSha: c.headSha,
    treeSha: c.treeSha,
    branch: c.branch,
    remoteHeadSha: c.expectedRemoteHeadSha,
    writerMapDigest: c.writerMapDigest,
    mergeAllowed: true,
    pr: {
      number: c.prNumber,
      baseBranch: c.baseBranch,
      branch: c.branch,
      headSha: c.headSha,
      origin: 'interdomestik/interdomestik',
    },
  };
}

export const memberWriterPaths = [
  'packages/domain-member/src/case-summary/types.ts',
  'packages/domain-member/src/case-summary/get-member-case-summaries.ts',
  'packages/domain-member/src/case-summary/get-member-case-summaries.test.ts',
  'packages/domain-member/src/index.ts',
  'apps/web/src/components/dashboard/case-summary/accident-case-summary.tsx',
  'apps/web/src/components/dashboard/case-summary/case-kind-registry.ts',
  'apps/web/src/components/dashboard/case-summary/case-kind-registry.test.tsx',
];

export function recoveryFile(root) {
  const directory = path.join(root, 'recovery-v1');
  return path.join(
    directory,
    fs.readdirSync(directory).find(name => name.endsWith('.json'))
  );
}
