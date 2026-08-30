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
const SHA256 = /^[0-9a-f]{64}$/u;
function reject(state, operation, reason) {
  state.rejected.push({ operation, reason });
}
function resolveForce(contract, repository, state) {
  const pr = state.virtualPulls[String(contract.target.prNumber)];
  let reason = null;
  if (repository?.branch !== contract.target.branch) {
    reason = repository?.branch === 'HEAD' ? 'detached-branch' : 'branch-mismatch';
  } else if (repository.headSha !== contract.target.headSha) reason = 'head-mismatch';
  else if (state.virtualHeads[contract.target.branch] !== contract.preconditions.leaseSha) {
    reason = state.virtualHeads[contract.target.branch]
      ? 'lease-mismatch'
      : 'remote-head-unavailable';
  } else if (
    !operationPullMatches(pr, contract.target, contract.preconditions.leaseSha) ||
    pr.branch !== contract.target.branch
  ) {
    reason = pr ? 'pull-request-mismatch' : 'pull-request-unavailable';
  }
  if (reason) {
    reject(state, contract.operation, reason);
    return;
  }
  state.virtualHeads[contract.target.branch] = contract.postconditions.remoteHeadSha;
  state.virtualPulls[String(contract.target.prNumber)] = {
    ...pr,
    headSha: contract.postconditions.prHeadSha,
  };
  state.forceTransitions.set(contract.target.branch, {
    state: 'resolved',
    lease: contract.preconditions.leaseSha,
    headSha: contract.target.headSha,
    prNumber: contract.target.prNumber,
  });
  state.granted.push(contract);
}
function resolveDeferredFullGate(contract, repository, state, transition) {
  const operationFacts = state.facts
    ? {
        ...state.facts,
        authority:
          transition?.state === 'resolved'
            ? { ...state.facts.authority, approvedHeadSha: transition.headSha }
            : state.facts.authority,
        pullRequestCandidates: state.virtualCandidates,
      }
    : null;
  const result = resolveDeferredOperation(contract, repository, operationFacts);
  if (result.granted || (contract.deferred && result.deferred))
    state.granted.push(result.granted ?? result.deferred);
  else reject(state, contract.operation, result.rejected);
}

function resolveFullGate(contract, repository, state) {
  const transition = state.forceTransitions.get(contract.target.branch);
  if (contract.target.mode === 'deferred-pr')
    return resolveDeferredFullGate(contract, repository, state, transition);
  const pr = state.virtualPulls[String(contract.target.prNumber)];
  const authority = state.facts?.authority;
  const approvedHead =
    transition?.state === 'resolved' ? transition.headSha : authority?.approvedHeadSha;
  let reason = null;
  if (!state.facts) reason = 'authority-facts-unavailable';
  else if (
    repository.headSha !== contract.target.headSha ||
    repository.branch !== contract.target.branch ||
    pr?.branch !== contract.target.branch
  ) {
    reason = 'head-or-branch-mismatch';
  } else if (
    authority?.runtimeAuthorized !== true ||
    authority.activeSlice !== contract.target.taskId ||
    approvedHead !== repository.headSha ||
    authority.writerMapDigest !== repository.writerMapDigest
  ) {
    reason = 'authority-identity-mismatch';
  } else if (!operationPullMatches(pr, contract.target, contract.preconditions.prHeadSha)) {
    reason = pr ? 'pull-request-mismatch' : 'pull-request-unavailable';
  } else if (pr.fullGateLabelPresent || !pr.fullGateEligible)
    reason = 'full-gate-label-not-eligible';
  if (reason) reject(state, contract.operation, reason);
  else state.granted.push(contract);
}

function resolveCleanup(contract, state) {
  const authority = state.facts?.authority;
  let reason = null;
  if (!state.facts) reason = 'authority-facts-unavailable';
  else if (![null, contract.target.taskId].includes(authority?.activeSlice)) {
    reason = 'authority-task-mismatch';
  } else if (
    contract.target.artifactPaths.some(
      path => state.facts.taskOwnedArtifacts[path]?.exists !== true
    )
  ) {
    reason = 'artifact-uninspectable';
  } else if (
    contract.target.artifactPaths.some(
      path =>
        state.facts.taskOwnedArtifacts[path]?.ownerTaskId !== contract.target.taskId ||
        state.facts.taskOwnedArtifacts[path]?.safeToDiscard !== true
    )
  ) {
    reason = 'artifact-discard-unverified';
  }
  if (reason) reject(state, contract.operation, reason);
  else if (authority.activeSlice === contract.target.taskId && authority.runtimeAuthorized) {
    state.granted.push({ ...contract, deferred: true });
  } else if (authority.activeSlice === null && authority.runtimeAuthorized === false) {
    state.granted.push({ ...contract, deferred: false });
  } else reject(state, contract.operation, 'authority-state-unverified');
}

export function resolveOperationalContracts(operations, repository) {
  const normalized = normalizeRoutineOperations(operations, { allowResolved: true });
  let facts = null;
  try {
    facts = normalizeOperationFacts(repository?.operationFacts, normalized);
  } catch {
    facts = null;
  }
  const state = {
    facts,
    granted: [],
    rejected: [],
    virtualPulls: structuredClone(facts?.pullRequests ?? {}),
    virtualHeads: { ...facts?.remoteHeads },
    virtualCandidates: structuredClone(facts?.pullRequestCandidates ?? {}),
    forceTransitions: new Map(),
  };
  for (const contract of normalized.filter(
    item => item?.operation === 'bounded_force_with_lease_rebuild'
  )) {
    resolveForce(contract, repository, state);
  }
  for (const contract of normalized) {
    if (typeof contract === 'string') state.granted.push(contract);
    else if (contract.operation === 'bounded_force_with_lease_rebuild') continue;
    else if (contract.operation === 'apply_full_gate_label')
      resolveFullGate(contract, repository, state);
    else resolveCleanup(contract, state);
  }
  return { facts, granted: state.granted, rejected: state.rejected };
}

export function verifyOperationAtExecution(contract, repository) {
  const resolution = resolveOperationalContracts([contract], repository);
  if (
    routineOperationName(contract) === 'task_owned_cleanup' &&
    resolution.facts?.authority?.runtimeAuthorized === true
  ) {
    throw new Error('cleanup execution requires inactive authority');
  }
  must(
    !resolution.rejected.length && !resolution.granted[0]?.deferred,
    'operation preconditions are no longer satisfied'
  );
  const normalized = resolution.granted[0];
  if (routineOperationName(normalized) === 'task_owned_cleanup') {
    must(
      resolution.facts?.authority.runtimeAuthorized === false &&
        resolution.facts.authority.activeSlice === null,
      'cleanup execution requires inactive authority'
    );
  }
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
