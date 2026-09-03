import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  canonicalJson,
  exactKeys,
  must,
  normalizeCommitSha,
  normalizeGitBranch,
  normalizePullRequestNumber,
  normalizeGitHubOrigin,
  safeRelativePath,
  sha256,
} from './slice-rehearse-canonical.mjs';
const ENVELOPE = /^[A-Z0-9][A-Z0-9-]*-DELIVERY-[1-9]\d*$/u;
const CERTIFICATE_ID = /^[A-Z0-9][A-Z0-9-]*-CERT-[1-9]\d*$/u;
const LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
export const OPERATION_ARTIFACT_ROOT = resolve(
  homedir(),
  '.cache/interdomestik-harness-operations'
);
const AUTHORITY_FIELDS =
  'approvalEnvelopeId authorityCertificate authorityCertificateSha256 expectedHeadSha'.split(' ');
const DEFINITIONS = {
  branch_push: [...AUTHORITY_FIELDS, 'branch', 'operation'],
  pr_create: [...AUTHORITY_FIELDS, 'baseBranch', 'bodyArtifact', 'branch', 'operation', 'title'],
  label_add: [...AUTHORITY_FIELDS, 'label', 'operation', 'prNumber'],
  feedback_comment: [...AUTHORITY_FIELDS, 'bodyArtifact', 'operation', 'prNumber'],
  conditional_merge: [...AUTHORITY_FIELDS, 'operation', 'prNumber'],
};
const CERTIFICATE_KEYS =
  'approvalBindingSha256 allowedOperations approvalEnvelopeId approvalReceiptSha256 artifacts baseBranch baseSha branch certificateId expectedRemoteHeadSha headSha mergeMethod origin outcomeRiskSha256 prNumber reportSha256 rehearsalReport schemaVersion sliceId treeSha workClass writerClosure writerMapDigest'.split(
    ' '
  );
export function operationApprovalBinding(certificate) {
  return sha256(
    canonicalJson({
      allowedOperations: certificate.allowedOperations,
      approvalEnvelopeId: certificate.approvalEnvelopeId,
      baseBranch: certificate.baseBranch,
      baseSha: certificate.baseSha,
      branch: certificate.branch,
      mergeMethod: certificate.mergeMethod,
      origin: certificate.origin,
      outcomeRiskSha256: certificate.outcomeRiskSha256,
      prNumber: certificate.prNumber,
      sliceId: certificate.sliceId,
      workClass: certificate.workClass,
      writerClosure: certificate.writerClosure,
      writerMapDigest: certificate.writerMapDigest,
    })
  );
}
function validateRehearsalReport(certificate) {
  const report = certificate.rehearsalReport;
  must(report && typeof report === 'object' && !Array.isArray(report), 'report is unavailable');
  must(report.schemaVersion === 1, 'report schema is invalid');
  must(report.reportSha256 === certificate.reportSha256, 'report digest differs');
  must(
    report.reportSha256 === sha256(canonicalJson({ ...report, reportSha256: null })),
    'report digest is invalid'
  );
  must(report.sliceId === certificate.sliceId, 'report slice differs');
  must(
    report.repository?.origin === certificate.origin &&
      report.repository?.baseSha === certificate.baseSha &&
      report.repository?.headSha === certificate.headSha &&
      report.repository?.treeSha === certificate.treeSha,
    'report candidate differs'
  );
  must(report.writers?.digest === certificate.writerMapDigest, 'report writer map differs');
  must(
    Array.isArray(report.authorityStops) && report.authorityStops.length === 0,
    'report has authority stops'
  );
  must(
    report.operationalEnvelope?.authorityGranted === false,
    'report authority carrier is invalid'
  );
  must(
    report.operationalEnvelope?.outcomeRiskSha256 === certificate.outcomeRiskSha256 &&
      report.operationalEnvelope?.branch === certificate.branch &&
      report.operationalEnvelope?.prNumber === certificate.prNumber &&
      canonicalJson(report.operationalEnvelope?.writerClosure) ===
        canonicalJson(certificate.writerClosure),
    'report approval provenance differs'
  );
}
function validateCertificate(request) {
  const certificate = request.authorityCertificate;
  exactKeys(certificate, CERTIFICATE_KEYS, 'authority certificate');
  must(certificate.schemaVersion === 1, 'certificate schema is invalid');
  must(CERTIFICATE_ID.test(certificate.certificateId), 'operation certificate ID is invalid');
  must(ENVELOPE.test(certificate.approvalEnvelopeId), 'delivery approval envelope is invalid');
  must(
    certificate.approvalEnvelopeId.startsWith(`${certificate.sliceId}-DELIVERY-`) &&
      certificate.certificateId.startsWith(`${certificate.sliceId}-CERT-`),
    'certificate slice identity differs'
  );
  must(certificate.approvalEnvelopeId === request.approvalEnvelopeId, 'request envelope differs');
  must(certificate.headSha === request.expectedHeadSha, 'approved head differs');
  for (const [value, label] of [
    [certificate.baseSha, 'certificate base SHA'],
    [certificate.headSha, 'certificate head SHA'],
    [certificate.treeSha, 'certificate tree SHA'],
  ])
    normalizeCommitSha(value, label);
  must(SHA256.test(certificate.writerMapDigest), 'certificate writer map digest is invalid');
  must(SHA256.test(certificate.reportSha256), 'certificate report digest is invalid');
  must(SHA256.test(certificate.approvalReceiptSha256), 'approval receipt digest is invalid');
  must(SHA256.test(certificate.outcomeRiskSha256), 'outcome/risk digest is invalid');
  must(
    Array.isArray(certificate.writerClosure) &&
      certificate.writerClosure.length > 0 &&
      new Set(certificate.writerClosure).size === certificate.writerClosure.length,
    'approved writer closure is invalid'
  );
  const writerClosure = certificate.writerClosure.map(path =>
    safeRelativePath(path, 'approved writer path')
  );
  must(
    canonicalJson(writerClosure) ===
      canonicalJson([...writerClosure].sort((a, b) => (a < b ? -1 : Number(a > b)))),
    'approved writer closure is not canonical'
  );
  validateRehearsalReport(certificate);
  must(
    ['governance', 'product'].includes(certificate.workClass),
    'certificate work class is invalid'
  );
  must(
    normalizeGitHubOrigin(certificate.origin).origin === certificate.origin,
    'certificate origin is not canonical'
  );
  normalizeGitBranch(certificate.branch);
  normalizeGitBranch(certificate.baseBranch);
  must(certificate.mergeMethod === 'squash', 'merge method is invalid');
  if (certificate.expectedRemoteHeadSha !== null) {
    normalizeCommitSha(certificate.expectedRemoteHeadSha, 'certificate remote head SHA');
  }
  if (certificate.prNumber !== null) normalizePullRequestNumber(certificate.prNumber);
  must(
    Array.isArray(certificate.allowedOperations) &&
      certificate.allowedOperations.includes(request.operation) &&
      new Set(certificate.allowedOperations).size === certificate.allowedOperations.length,
    'operation is outside the authority certificate'
  );
  must(
    certificate.artifacts &&
      typeof certificate.artifacts === 'object' &&
      !Array.isArray(certificate.artifacts),
    'certificate artifacts are invalid'
  );
  for (const [artifact, digest] of Object.entries(certificate.artifacts)) {
    safeRelativePath(artifact, 'certificate artifact path');
    must(SHA256.test(digest), 'certificate artifact digest is invalid');
  }
  must(
    request.authorityCertificateSha256 === sha256(canonicalJson(certificate)),
    'operation authority certificate digest differs'
  );
  must(
    certificate.approvalBindingSha256 === operationApprovalBinding(certificate),
    'operation approval binding differs'
  );
  return certificate;
}
export function operationBodyArtifact(certificate, value) {
  const artifact = safeRelativePath(value, 'operation body artifact path');
  must(
    Object.hasOwn(certificate.artifacts, artifact),
    'operation body artifact is not certificate-bound'
  );
  return resolve(OPERATION_ARTIFACT_ROOT, artifact);
}

function prCreate(request, certificate) {
  const title = request.title?.trim();
  must(
    typeof title === 'string' && title.length > 0 && !/[\r\n]/u.test(title),
    'PR title is invalid'
  );
  must(certificate.prNumber === null, 'PR creation certificate already binds a PR');
  must(
    request.branch === certificate.branch && request.baseBranch === certificate.baseBranch,
    'PR branch identity differs from certificate'
  );
  return {
    binary: 'gh',
    args: [
      'pr',
      'create',
      '--head',
      normalizeGitBranch(request.branch),
      '--base',
      normalizeGitBranch(request.baseBranch),
      '--title',
      title,
      '--body-file',
      operationBodyArtifact(certificate, request.bodyArtifact),
    ],
    mutating: true,
    boundary: 'pre_pr',
    certificate,
  };
}

function pullOperation(request, certificate) {
  const prNumber = normalizePullRequestNumber(request.prNumber);
  must(certificate.prNumber === prNumber, 'operation PR differs from certificate');
  if (request.operation === 'label_add') {
    must(LABEL.test(request.label ?? ''), 'label is invalid');
    return {
      binary: 'gh',
      args: ['pr', 'edit', String(prNumber), '--add-label', request.label],
      mutating: true,
      boundary: 'pre_pr',
      certificate,
    };
  }
  if (request.operation === 'conditional_merge')
    return {
      binary: 'gh',
      args: [
        'pr',
        'merge',
        String(prNumber),
        `--${certificate.mergeMethod}`,
        '--match-head-commit',
        certificate.headSha,
      ],
      mutating: true,
      boundary: 'pre_merge',
      certificate,
    };
  return {
    binary: 'gh',
    args: [
      'pr',
      'comment',
      String(prNumber),
      '--body-file',
      operationBodyArtifact(certificate, request.bodyArtifact),
    ],
    mutating: true,
    boundary: 'pre_pr',
    certificate,
  };
}

export function buildSafeOperation(request) {
  must(request && typeof request === 'object', 'operation request is invalid');
  const keys = DEFINITIONS[request.operation];
  must(keys, 'operation is unsupported');
  exactKeys(request, keys, 'operation request');
  const certificate = validateCertificate(request);
  if (request.operation === 'branch_push') {
    const branch = normalizeGitBranch(request.branch);
    must(branch === certificate.branch, 'push branch differs from certificate');
    return {
      binary: '/usr/bin/git',
      args: ['push', 'origin', `${certificate.headSha}:refs/heads/${branch}`],
      mutating: true,
      boundary: 'pre_push',
      certificate,
    };
  }
  return request.operation === 'pr_create'
    ? prCreate(request, certificate)
    : pullOperation(request, certificate);
}
