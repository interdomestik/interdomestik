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
  stale_pr_disposition: [...AUTHORITY_FIELDS, 'operation', 'prNumber', 'reason'],
  conditional_merge: [...AUTHORITY_FIELDS, 'operation', 'prNumber'],
};
const CERTIFICATE_KEYS =
  'approvalBindingSha256 allowedOperations approvalEnvelopeId approvalReceiptSha256 artifacts baseBranch baseSha branch certificateId expectedRemoteHeadSha headSha mergeMethod origin outcomeRiskSha256 prNumber reportSha256 rehearsalReport schemaVersion sliceId treeSha workClass writerClosure writerMapDigest'.split(
    ' '
  );
export function stalePrDispositionCommand(request, operations) {
  exactKeys(request, ['prNumber', 'reason'], 'stale PR disposition request');
  const named = name => operations.find(item => item?.operation === name);
  const lifecycle = named('compile_same_slice_delivery');
  const disposition = named('stale_pr_disposition');
  const stale = lifecycle?.target.prRoles.find(role => role.role === 'stale-prerequisite');
  const product = lifecycle?.target.prRoles.find(role => role.role === 'product');
  const number = normalizePullRequestNumber(request.prNumber);
  must(
    disposition &&
      stale &&
      number === disposition.target.number &&
      number === stale.number &&
      number !== product?.number &&
      request.reason === disposition.preconditions.reason,
    'stale PR disposition differs from compiled lifecycle'
  );
  return ['pr', 'close', String(number), '--comment', request.reason];
}
export function operationApprovalBinding(c) {
  const fields = `allowedOperations approvalEnvelopeId baseBranch baseSha branch mergeMethod origin outcomeRiskSha256 prNumber sliceId workClass writerClosure writerMapDigest${c.allowedOperations?.includes('stale_pr_disposition') ? ' reportSha256' : ''}`;
  return sha256(canonicalJson(Object.fromEntries(fields.split(' ').map(key => [key, c[key]]))));
}
function validateRehearsalReport(c) {
  const report = c.rehearsalReport;
  must(report && typeof report === 'object' && !Array.isArray(report), 'report is unavailable');
  must(report.schemaVersion === 1, 'report schema is invalid');
  must(report.reportSha256 === c.reportSha256, 'report digest differs');
  must(
    report.reportSha256 === sha256(canonicalJson({ ...report, reportSha256: null })),
    'report digest is invalid'
  );
  must(report.sliceId === c.sliceId, 'report slice differs');
  must(
    report.repository?.origin === c.origin &&
      report.repository?.baseSha === c.baseSha &&
      report.repository?.headSha === c.headSha &&
      report.repository?.treeSha === c.treeSha,
    'report candidate differs'
  );
  must(report.writers?.digest === c.writerMapDigest, 'report writer map differs');
  must(
    Array.isArray(report.authorityStops) && report.authorityStops.length === 0,
    'report has authority stops'
  );
  must(
    report.operationalEnvelope?.authorityGranted === false,
    'report authority carrier is invalid'
  );
  must(
    report.operationalEnvelope?.outcomeRiskSha256 === c.outcomeRiskSha256 &&
      report.operationalEnvelope?.branch === c.branch &&
      report.operationalEnvelope?.prNumber === c.prNumber &&
      canonicalJson(report.operationalEnvelope?.writerClosure) === canonicalJson(c.writerClosure),
    'report approval provenance differs'
  );
}
function validateCertificate(request) {
  const c = request.authorityCertificate;
  exactKeys(c, CERTIFICATE_KEYS, 'authority certificate');
  must(c.schemaVersion === 1, 'certificate schema is invalid');
  must(CERTIFICATE_ID.test(c.certificateId), 'operation certificate ID is invalid');
  must(ENVELOPE.test(c.approvalEnvelopeId), 'delivery approval envelope is invalid');
  must(
    c.approvalEnvelopeId.startsWith(`${c.sliceId}-DELIVERY-`) &&
      c.certificateId.startsWith(`${c.sliceId}-CERT-`),
    'certificate slice identity differs'
  );
  must(c.approvalEnvelopeId === request.approvalEnvelopeId, 'request envelope differs');
  must(c.headSha === request.expectedHeadSha, 'approved head differs');
  for (const [value, label] of [
    [c.baseSha, 'certificate base SHA'],
    [c.headSha, 'certificate head SHA'],
    [c.treeSha, 'certificate tree SHA'],
  ])
    normalizeCommitSha(value, label);
  must(SHA256.test(c.writerMapDigest), 'certificate writer map digest is invalid');
  must(SHA256.test(c.reportSha256), 'certificate report digest is invalid');
  must(SHA256.test(c.approvalReceiptSha256), 'approval receipt digest is invalid');
  must(SHA256.test(c.outcomeRiskSha256), 'outcome/risk digest is invalid');
  must(
    Array.isArray(c.writerClosure) &&
      c.writerClosure.length > 0 &&
      new Set(c.writerClosure).size === c.writerClosure.length,
    'approved writer closure is invalid'
  );
  const writerClosure = c.writerClosure.map(path => safeRelativePath(path, 'approved writer path'));
  must(
    canonicalJson(writerClosure) ===
      canonicalJson([...writerClosure].sort((a, b) => (a < b ? -1 : Number(a > b)))),
    'approved writer closure is not canonical'
  );
  validateRehearsalReport(c);
  must(['governance', 'product'].includes(c.workClass), 'certificate work class is invalid');
  must(normalizeGitHubOrigin(c.origin).origin === c.origin, 'certificate origin is not canonical');
  normalizeGitBranch(c.branch);
  normalizeGitBranch(c.baseBranch);
  must(c.mergeMethod === 'squash', 'merge method is invalid');
  if (c.expectedRemoteHeadSha !== null) {
    normalizeCommitSha(c.expectedRemoteHeadSha, 'certificate remote head SHA');
  }
  if (c.prNumber !== null) normalizePullRequestNumber(c.prNumber);
  must(
    Array.isArray(c.allowedOperations) &&
      c.allowedOperations.includes(request.operation) &&
      new Set(c.allowedOperations).size === c.allowedOperations.length,
    'operation is outside the authority certificate'
  );
  must(
    c.artifacts && typeof c.artifacts === 'object' && !Array.isArray(c.artifacts),
    'certificate artifacts are invalid'
  );
  for (const [artifact, digest] of Object.entries(c.artifacts)) {
    safeRelativePath(artifact, 'certificate artifact path');
    must(SHA256.test(digest), 'certificate artifact digest is invalid');
  }
  must(
    request.authorityCertificateSha256 === sha256(canonicalJson(c)),
    'operation authority certificate digest differs'
  );
  must(
    c.approvalBindingSha256 === operationApprovalBinding(c),
    'operation approval binding differs'
  );
  return c;
}
export function operationBodyArtifact(c, value) {
  const artifact = safeRelativePath(value, 'operation body artifact path');
  must(Object.hasOwn(c.artifacts, artifact), 'operation body artifact is not certificate-bound');
  return resolve(OPERATION_ARTIFACT_ROOT, artifact);
}

function prCreate(request, c) {
  const title = request.title?.trim();
  must(
    typeof title === 'string' && title.length > 0 && !/[\r\n]/u.test(title),
    'PR title is invalid'
  );
  must(c.prNumber === null, 'PR creation certificate already binds a PR');
  must(
    request.branch === c.branch && request.baseBranch === c.baseBranch,
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
      operationBodyArtifact(c, request.bodyArtifact),
    ],
    mutating: true,
    boundary: 'pre_pr',
    certificate: c,
  };
}

function pullOperation(request, c) {
  const prNumber = normalizePullRequestNumber(request.prNumber);
  let boundary = 'pre_pr';
  let args;
  if (request.operation === 'stale_pr_disposition')
    args = stalePrDispositionCommand(
      { prNumber, reason: request.reason },
      c.rehearsalReport.writers?.routineOperations ?? []
    );
  else {
    must(c.prNumber === prNumber, 'operation PR differs from certificate');
    if (request.operation === 'label_add') {
      must(LABEL.test(request.label ?? ''), 'label is invalid');
      args = ['pr', 'edit', String(prNumber), '--add-label', request.label];
    } else if (request.operation === 'conditional_merge') {
      boundary = 'pre_merge';
      args = [
        'pr',
        'merge',
        String(prNumber),
        `--${c.mergeMethod}`,
        '--match-head-commit',
        c.headSha,
      ];
    } else
      args = [
        'pr',
        'comment',
        String(prNumber),
        '--body-file',
        operationBodyArtifact(c, request.bodyArtifact),
      ];
  }
  return {
    binary: 'gh',
    args,
    mutating: true,
    boundary,
    certificate: c,
  };
}

export function buildSafeOperation(request) {
  must(request && typeof request === 'object', 'operation request is invalid');
  const keys = DEFINITIONS[request.operation];
  must(keys, 'operation is unsupported');
  exactKeys(request, keys, 'operation request');
  const c = validateCertificate(request);
  if (request.operation === 'branch_push') {
    const branch = normalizeGitBranch(request.branch);
    must(branch === c.branch, 'push branch differs from certificate');
    return {
      binary: '/usr/bin/git',
      args: ['push', 'origin', `${c.headSha}:refs/heads/${branch}`],
      mutating: true,
      boundary: 'pre_push',
      certificate: c,
    };
  }
  return request.operation === 'pr_create' ? prCreate(request, c) : pullOperation(request, c);
}
