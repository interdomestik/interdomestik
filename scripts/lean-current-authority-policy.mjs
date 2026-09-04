import {
  exactWriterClassification,
  isT117BPortalRuntime,
} from './lean-exact-writer-exceptions.mjs';

export const APPROVAL_PREFIX = 'LEAN_AUTHORITY_APPROVAL_V1';
export const AUTHORITY = 'lean-tier12-v1';
export const PROGRAM = 'docs/plans/current-program.md';
export const TRACKER = 'docs/plans/current-tracker.md';
export const CLOSEOUT = [PROGRAM, TRACKER];
export const ORIGIN = 'interdomestik/interdomestik';
export const BOOTSTRAP_BASE = '87f6dcc91e33abe51169fc95064fc585bd10d064';
export const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PROMOTION_GATE =
  /^docs\/plans\/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*-(?:design|gate)\.(?:json|md)$/u;
const PROMOTION_ADMISSION = /^docs\/plans\/\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*-admission\.json$/u;
const DENY_PATTERNS = [
  /^(?:AGENTS|README)\.md$/u,
  /^\.(?:github|codex)\//u,
  /^docs\/architecture\//u,
  /^docs\/plans\/(?:current-|architecture-finalization-)/u,
  /^apps\/web\/src\/(?:proxy|middleware)\.[cm]?[jt]sx?$/u,
  /^apps\/web\/src\/(?:lib|server)\/(?:auth|tenant)\//u,
  /^apps\/web\/src\/app\/api\/auth\//u,
  /^apps\/web\/src\/app\/.+\/\(auth\)\//u,
  /^apps\/web\/(?:src\/)?messages\/[^/]+\/(?:auth|legal|commercial[-_]?terms)\.json$/iu,
  /^packages\/(?:shared-auth|database|domain-[^/]+)\//u,
  /^(?:supabase|drizzle|prompts)\//u,
  /^(?:scripts\/ci\/|apps\/web\/e2e\/)/u,
];
const ALLOW_PATTERNS = [
  /^apps\/web\/src\/app\/.+\/(?:page|loading|error|not-found)(?:\.test)?\.[jt]sx?$/u,
  /^apps\/web\/src\/components\/.+\.(?:[jt]sx?|css)$/u,
  /^apps\/web\/src\/(?:styles|messages)\/.+\.(?:css|json)$/u,
  /^apps\/web\/messages\/.+\.json$/u,
  /^packages\/ui\/src\/.+\.(?:[jt]sx?|css)$/u,
];
const PROTECTED_TOKENS = new Set(
  [
    'authority governance',
    'auth authentication login logout signin signout signup register oauth credential credentials password session',
    'tenant access legal privacy role roles permission permissions',
    'proxy middleware route router routing',
    'database db schema migration migrations sql rls',
    'billing payment payments paddle stripe',
    'ai model models prompt prompts eval evals evaluation evaluations',
    'ci delivery e2e playwright docker',
  ].flatMap(group => group.split(' '))
);
const PROTECTED_FILES = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
]);

export const compareCanonicalText = (left, right) => left.localeCompare(right, 'en');
export const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export const sameSet = (left, right) =>
  Array.isArray(left) &&
  Array.isArray(right) &&
  left.length === right.length &&
  new Set(left).size === left.length &&
  new Set(right).size === right.length &&
  left.every(value => right.includes(value));

function keysAre(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return sameSet(Object.keys(value), expectedKeys);
}

function hasProtectedSegment(path) {
  const segments = path.toLowerCase().split('/');
  const fileName = segments.at(-1);
  if (PROTECTED_FILES.has(fileName)) return true;
  if (
    segments.some(
      segment =>
        segment === 'dockerfile' ||
        segment.startsWith('dockerfile.') ||
        segment.startsWith('docker-compose') ||
        segment.startsWith('playwright')
    )
  )
    return true;
  const boundaryTokens = path.toLowerCase().split(/[/._-]+/u);
  return boundaryTokens.some(token => PROTECTED_TOKENS.has(token));
}

export function classifyWriterPath(path, slice) {
  const safe =
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
  if (!safe) return { allowed: false, classification: 'malformed' };
  const exactClassification = exactWriterClassification(path, slice);
  if (exactClassification) return { allowed: true, classification: exactClassification };
  if (DENY_PATTERNS.some(pattern => pattern.test(path)) || hasProtectedSegment(path)) {
    return { allowed: false, classification: 'protected' };
  }
  const allowed = ALLOW_PATTERNS.some(pattern => pattern.test(path));
  return { allowed, classification: allowed ? 'tier1_or_2' : 'unknown' };
}
export function promotionArtifactPaths(paths) {
  if (!Array.isArray(paths) || paths.length !== 4 || new Set(paths).size !== paths.length)
    return null;
  const artifacts = paths.filter(path => !CLOSEOUT.includes(path));
  const gate = artifacts.filter(path => PROMOTION_GATE.test(path));
  const admission = artifacts.filter(path => PROMOTION_ADMISSION.test(path));
  return CLOSEOUT.every(path => paths.includes(path)) && gate.length === 1 && admission.length === 1
    ? { admission: admission[0], gate: gate[0] }
    : null;
}
export const validPromotionWriterPaths = paths => promotionArtifactPaths(paths) !== null;

export function validateSlice(slice) {
  const fields =
    `sliceId tier promotionPrNumber promotionBaseSha expectedProductBranch gateSha256 admissionSha256 productWriterPaths closeoutWriterPaths`.split(
      ' '
    );
  const writers = slice?.productWriterPaths;
  const checks = [
    keysAre(slice, fields),
    /^[A-Z0-9][A-Z0-9-]+$/u.test(slice?.sliceId ?? ''),
    [1, 2].includes(slice?.tier) || isT117BPortalRuntime(slice),
    Number.isSafeInteger(slice?.promotionPrNumber) && slice.promotionPrNumber > 0,
    SHA40.test(slice?.promotionBaseSha ?? ''),
    SHA256.test(slice?.gateSha256 ?? ''),
    SHA256.test(slice?.admissionSha256 ?? ''),
    /^codex\/[a-z0-9][a-z0-9-]+$/u.test(slice?.expectedProductBranch ?? ''),
    Array.isArray(writers) &&
      writers.length > 0 &&
      (writers.length <= 12 ||
        (isT117BPortalRuntime(slice) &&
          (writers.length === 20 || (slice.sliceId === 'T117B-CUTOVER' && writers.length === 21)))),
    Array.isArray(writers) && new Set(writers).size === writers.length,
    Array.isArray(writers) && writers.every(path => classifyWriterPath(path, slice).allowed),
    same(slice?.closeoutWriterPaths, CLOSEOUT),
  ];
  if (!checks.every(Boolean)) throw new Error('active slice schema or policy mismatch');
  return slice;
}

export function validateProjection(value) {
  const valid =
    keysAre(value, ['schemaVersion', 'authority', 'lifecycle', 'owner', 'activeSlice']) &&
    value.schemaVersion === 1 &&
    value.authority === AUTHORITY &&
    keysAre(value.owner, ['login', 'id']) &&
    value.owner.login === 'arbenl' &&
    value.owner.id === 62884977;
  if (!valid) throw new Error('Lean projection schema or owner mismatch');
  if (value.lifecycle === 'inactive' && value.activeSlice === null) return value;
  if (value.lifecycle !== 'promotion_pending' || !value.activeSlice) {
    throw new Error('Lean projection lifecycle mismatch');
  }
  validateSlice(value.activeSlice);
  return value;
}

function extractProjection(text, label) {
  const matches = [...text.matchAll(/```json lean-authority\n([\s\S]*?)\n```/gu)];
  if (matches.length !== 1) throw new Error(`${label} Lean authority block missing or duplicated`);
  const value = JSON.parse(matches[0][1]);
  if (matches[0][1] !== JSON.stringify(value, null, 2)) {
    throw new Error(`${label} Lean authority block is not canonical JSON`);
  }
  return validateProjection(value);
}

export function parseAuthorityDocuments(program, tracker) {
  const left = extractProjection(program, 'program');
  const right = extractProjection(tracker, 'tracker');
  if (!same(left, right)) throw new Error('program and tracker Lean authority disagree');
  return left;
}

export function approvalMarker(slice, promotionHeadSha, promotionTreeSha) {
  validateSlice(slice);
  if (![promotionHeadSha, promotionTreeSha].every(sha => SHA40.test(sha))) {
    throw new Error('approval Git identity mismatch');
  }
  const binding = {
    sliceId: slice.sliceId,
    promotionBaseSha: slice.promotionBaseSha,
    promotionHeadSha,
    promotionTreeSha,
    gateSha256: slice.gateSha256,
    admissionSha256: slice.admissionSha256,
    expectedProductBranch: slice.expectedProductBranch,
    productWriterPaths: slice.productWriterPaths,
    closeoutWriterPaths: slice.closeoutWriterPaths,
  };
  return `${APPROVAL_PREFIX}\n${JSON.stringify(binding)}`;
}
