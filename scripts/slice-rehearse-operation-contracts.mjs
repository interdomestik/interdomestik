import { exactKeys, must, sha256 } from './slice-rehearse-canonical.mjs';
import {
  normalizeOperationFacts,
  operationPullMatches,
  resolveDeferredOperation,
} from './slice-rehearse-operation-facts-schema.mjs';
import {
  normalizeRoutineOperations,
  routineOperationName,
} from './slice-rehearse-operation-schema.mjs';
export {
  normalizeRoutineOperations,
  ROUTINE_OPERATIONS,
  routineOperationName,
} from './slice-rehearse-operation-schema.mjs';
export { stalePrDispositionCommand } from './slice-rehearse-operation-certificate.mjs';
export {
  classifyStalePrReconciliation,
  stalePrRole,
  verifyStalePrLiveFacts,
} from './slice-rehearse-operation-live.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const ROLE_KEYS =
  'baseBranch baseSha branch changedPathDigest changedPaths headSha number role state'.split(' ');
const same = (left, right, keys = ROLE_KEYS) =>
  keys.every(key => JSON.stringify(left?.[key]) === JSON.stringify(right?.[key]));
const reject = (s, operation, reason) => s.r.push({ operation, reason });
const settle = (s, c, reason, grant = c) =>
  reason ? reject(s, c.operation, reason) : s.g.push(grant);

function force(c, repo, s) {
  const { target, preconditions: pre, postconditions: post } = c;
  const pr = s.p[target.prNumber];
  let reason = null;
  if (repo?.branch !== target.branch)
    reason = repo?.branch === 'HEAD' ? 'detached-branch' : 'branch-mismatch';
  else if (repo.headSha !== target.headSha) reason = 'head-mismatch';
  else if (s.h[target.branch] !== pre.leaseSha)
    reason = s.h[target.branch] ? 'lease-mismatch' : 'remote-head-unavailable';
  else if (!operationPullMatches(pr, target, pre.leaseSha) || pr.branch !== target.branch)
    reason = pr ? 'pull-request-mismatch' : 'pull-request-unavailable';
  if (reason) return reject(s, c.operation, reason);
  s.h[target.branch] = post.remoteHeadSha;
  s.p[target.prNumber] = { ...pr, headSha: post.prHeadSha };
  s.t.set(target.branch, target.headSha);
  s.g.push(c);
}

function deferred(c, repo, s, transition) {
  const facts = s.f
    ? {
        ...s.f,
        authority: transition ? { ...s.f.authority, approvedHeadSha: transition } : s.f.authority,
      }
    : null;
  const result = resolveDeferredOperation(c, repo, facts);
  const grant = result.granted ?? (c.deferred && result.deferred);
  settle(s, c, grant ? null : result.rejected, grant);
}

function fullGate(c, repo, s) {
  const { target } = c;
  const transition = s.t.get(target.branch);
  if (target.mode === 'deferred-pr') return deferred(c, repo, s, transition);
  const pr = s.p[target.prNumber];
  const authority = s.f?.authority;
  const approvedHead = transition ?? authority?.approvedHeadSha;
  let reason = null;
  if (!s.f) reason = 'authority-facts-unavailable';
  else if (
    repo.headSha !== target.headSha ||
    repo.branch !== target.branch ||
    pr?.branch !== target.branch
  )
    reason = 'head-or-branch-mismatch';
  else if (
    authority?.runtimeAuthorized !== true ||
    authority.activeSlice !== target.taskId ||
    approvedHead !== repo.headSha ||
    authority.writerMapDigest !== repo.writerMapDigest
  )
    reason = 'authority-identity-mismatch';
  else if (!operationPullMatches(pr, target, c.preconditions.prHeadSha))
    reason = pr ? 'pull-request-mismatch' : 'pull-request-unavailable';
  else if (pr.fullGateLabelPresent || !pr.fullGateEligible) reason = 'full-gate-label-not-eligible';
  settle(s, c, reason);
}

function cleanup(c, s) {
  const authority = s.f?.authority;
  const artifacts = c.target.artifactPaths.map(path => s.f?.taskOwnedArtifacts[path]);
  let reason = null;
  if (!s.f) reason = 'authority-facts-unavailable';
  else if (![null, c.target.taskId].includes(authority?.activeSlice))
    reason = 'authority-task-mismatch';
  else if (artifacts.some(item => item?.exists !== true)) reason = 'artifact-uninspectable';
  else if (
    artifacts.some(item => item.ownerTaskId !== c.target.taskId || item.safeToDiscard !== true)
  )
    reason = 'artifact-discard-unverified';
  if (reason) return settle(s, c, reason);
  if (authority.activeSlice === c.target.taskId && authority.runtimeAuthorized)
    settle(s, c, null, { ...c, deferred: true });
  else if (authority.activeSlice === null && authority.runtimeAuthorized === false)
    settle(s, c, null, { ...c, deferred: false });
  else settle(s, c, 'authority-state-unverified');
}

function delivery(c, repo, s) {
  let reason = null;
  if (!s.f) reason = 'delivery-facts-unavailable';
  else if (repo.writerMapDigest !== c.target.writerLineage.currentDigest)
    reason = 'writer-lineage-mismatch';
  settle(s, c, reason);
}

function stale(c, s, parent) {
  const declared = parent?.target.prRoles.find(role => role.role === 'stale-prerequisite');
  let reason = null;
  if (!s.f) reason = 'delivery-facts-unavailable';
  else if (
    !same(declared, c.target) ||
    c.target.origin !== parent?.target.origin ||
    c.target.taskId !== parent?.target.taskId
  )
    reason = 'stale-pr-role-mismatch';
  else if (!s.g.includes(parent))
    reason =
      s.r.find(item => item.operation === parent.operation)?.reason ??
      'delivery-lifecycle-unresolved';
  settle(s, c, reason);
}

export function resolveOperationalContracts(operations, repo) {
  const normalized = normalizeRoutineOperations(operations, { allowResolved: true });
  let facts = null;
  try {
    facts = normalizeOperationFacts(repo?.operationFacts, normalized);
  } catch {}
  const s = {
    f: facts,
    g: [],
    r: [],
    p: structuredClone(facts?.pullRequests ?? {}),
    h: { ...facts?.remoteHeads },
    t: new Map(),
  };
  const parent = normalized.find(item => item?.operation === 'compile_same_slice_delivery');
  for (const c of normalized.filter(item => item?.operation === 'bounded_force_with_lease_rebuild'))
    force(c, repo, s);
  for (const c of normalized) {
    if (typeof c === 'string') s.g.push(c);
    else if (c.operation === 'bounded_force_with_lease_rebuild') continue;
    else if (c.operation === 'compile_same_slice_delivery') delivery(c, repo, s);
    else if (c.operation === 'stale_pr_disposition') stale(c, s, parent);
    else if (c.operation === 'apply_full_gate_label') fullGate(c, repo, s);
    else cleanup(c, s);
  }
  return { facts, granted: s.g, rejected: s.r };
}

export function verifyOperationAtExecution(c, repo) {
  const result = resolveOperationalContracts([c], repo);
  const isCleanup = routineOperationName(c) === 'task_owned_cleanup';
  if (isCleanup && result.facts?.authority?.runtimeAuthorized === true)
    throw new Error('cleanup execution requires inactive authority');
  must(
    !result.rejected.length && !result.granted[0]?.deferred,
    'operation preconditions are no longer satisfied'
  );
  const normalized = result.granted[0];
  if (routineOperationName(normalized) === 'task_owned_cleanup')
    must(
      result.facts?.authority.runtimeAuthorized === false &&
        result.facts.authority.activeSlice === null,
      'cleanup execution requires inactive authority'
    );
  return normalized;
}

export function requiredBudgetArtifactSha256(report, requiredOperations) {
  if (!requiredOperations.includes('derived_capacity_rebind')) return null;
  const artifact = report?.capacity?.budgetArtifact;
  exactKeys(artifact, ['content', 'sha256', 'utf8Bytes'], 'capacity budget artifact');
  must(
    typeof artifact.content === 'string' && SHA256.test(artifact.sha256),
    'capacity budget artifact is invalid'
  );
  must(
    Buffer.byteLength(artifact.content) === artifact.utf8Bytes,
    'capacity budget artifact byte count differs'
  );
  const digest = sha256(artifact.content);
  must(digest === artifact.sha256, 'capacity budget artifact digest differs');
  return digest;
}
