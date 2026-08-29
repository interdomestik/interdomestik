import { createHash } from 'node:crypto';

import { normalizeOperationFacts } from './slice-rehearse-operation-facts-schema.mjs';
import {
  normalizeRoutineOperations,
  ROUTINE_OPERATIONS,
  routineOperationName,
} from './slice-rehearse-operation-schema.mjs';

export {
  normalizeRoutineOperations,
  ROUTINE_OPERATIONS,
  routineOperationName,
} from './slice-rehearse-operation-schema.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;

function must(condition, message) {
  if (!condition) throw new Error(message);
}
function exactKeys(value, expected, label) {
  must(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  must(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()),
    `${label} keys are invalid`
  );
}
function samePull(pr, target, headSha) {
  return Boolean(
    pr &&
    pr.origin === target.origin &&
    pr.baseBranch === target.baseBranch &&
    pr.headSha === headSha &&
    pr.state === 'OPEN'
  );
}
function resolveDeferred(contract, repository, facts) {
  if (!facts) return { rejected: 'authority-facts-unavailable' };
  const candidates = facts.pullRequestCandidates[contract.target.branch] ?? [];
  const authority = facts.authority;
  const prePull =
    candidates.length === 0 &&
    authority?.approvedHeadSha === null &&
    ((authority.runtimeAuthorized === false && authority.activeSlice === null) ||
      (authority.runtimeAuthorized === true &&
        authority.activeSlice === contract.target.taskId &&
        authority.writerMapDigest === repository.writerMapDigest));
  if (prePull) return { deferred: contract };
  const valid =
    candidates.length === 1 &&
    (contract.deferred !== false || candidates[0].number === contract.resolvedPrNumber) &&
    repository.branch === contract.target.branch &&
    samePull(candidates[0], contract.target, repository.headSha) &&
    candidates[0].branch === contract.target.branch &&
    !candidates[0].fullGateLabelPresent &&
    candidates[0].fullGateEligible &&
    authority?.runtimeAuthorized === true &&
    authority?.activeSlice === contract.target.taskId &&
    authority?.approvedHeadSha === repository.headSha &&
    authority?.writerMapDigest === repository.writerMapDigest;
  return valid
    ? { granted: { ...contract, deferred: false, resolvedPrNumber: candidates[0].number } }
    : { rejected: 'deferred-predicate-unresolved' };
}

export function resolveOperationalContracts(operations, repository) {
  const normalized = normalizeRoutineOperations(operations, { allowResolved: true });
  let facts = null;
  try {
    facts = normalizeOperationFacts(repository?.operationFacts, normalized);
  } catch {
    facts = null;
  }
  const granted = [],
    rejected = [];
  const virtualPulls = structuredClone(facts?.pullRequests ?? {}),
    virtualHeads = { ...(facts?.remoteHeads ?? {}) },
    virtualCandidates = structuredClone(facts?.pullRequestCandidates ?? {}),
    forceTransitions = new Map();
  const reject = (operation, reason) => rejected.push({ operation, reason });
  for (const contract of normalized.filter(
    item => item?.operation === 'bounded_force_with_lease_rebuild'
  )) {
    const pr = virtualPulls[String(contract.target.prNumber)];
    if (repository?.branch !== contract.target.branch)
      reject(
        contract.operation,
        repository?.branch === 'HEAD' ? 'detached-branch' : 'branch-mismatch'
      );
    else if (repository.headSha !== contract.target.headSha)
      reject(contract.operation, 'head-mismatch');
    else if (virtualHeads[contract.target.branch] !== contract.preconditions.leaseSha)
      reject(
        contract.operation,
        virtualHeads[contract.target.branch] ? 'lease-mismatch' : 'remote-head-unavailable'
      );
    else if (
      !samePull(pr, contract.target, contract.preconditions.leaseSha) ||
      pr.branch !== contract.target.branch
    )
      reject(contract.operation, pr ? 'pull-request-mismatch' : 'pull-request-unavailable');
    else {
      virtualHeads[contract.target.branch] = contract.postconditions.remoteHeadSha;
      virtualPulls[String(contract.target.prNumber)] = {
        ...pr,
        headSha: contract.postconditions.prHeadSha,
      };
      forceTransitions.set(contract.target.branch, {
        state: 'resolved',
        lease: contract.preconditions.leaseSha,
        headSha: contract.target.headSha,
        prNumber: contract.target.prNumber,
      });
      granted.push(contract);
    }
  }
  for (const contract of normalized) {
    if (typeof contract === 'string') granted.push(contract);
    else if (contract.operation === 'bounded_force_with_lease_rebuild') continue;
    else if (contract.operation === 'apply_full_gate_label') {
      if (contract.target.mode === 'deferred-pr') {
        const transition = forceTransitions.get(contract.target.branch);
        const operationFacts = facts
          ? {
              ...facts,
              authority:
                transition?.state === 'resolved'
                  ? { ...facts.authority, approvedHeadSha: transition.headSha }
                  : facts.authority,
              pullRequestCandidates: virtualCandidates,
            }
          : null;
        const result = resolveDeferred(contract, repository, operationFacts);
        if (result.granted || (contract.deferred && result.deferred))
          granted.push(result.granted ?? result.deferred);
        else reject(contract.operation, result.rejected);
      } else {
        const pr = virtualPulls[String(contract.target.prNumber)];
        const authority = facts?.authority;
        const transition = forceTransitions.get(contract.target.branch);
        const approvedHead =
          transition?.state === 'resolved' ? transition.headSha : authority?.approvedHeadSha;
        if (!facts) reject(contract.operation, 'authority-facts-unavailable');
        else if (
          repository.headSha !== contract.target.headSha ||
          repository.branch !== contract.target.branch ||
          pr?.branch !== contract.target.branch
        )
          reject(contract.operation, 'head-or-branch-mismatch');
        else if (
          authority?.runtimeAuthorized !== true ||
          authority?.activeSlice !== contract.target.taskId ||
          approvedHead !== repository.headSha ||
          authority?.writerMapDigest !== repository.writerMapDigest
        )
          reject(contract.operation, 'authority-identity-mismatch');
        else if (!samePull(pr, contract.target, contract.preconditions.prHeadSha))
          reject(contract.operation, pr ? 'pull-request-mismatch' : 'pull-request-unavailable');
        else if (pr.fullGateLabelPresent || !pr.fullGateEligible)
          reject(contract.operation, 'full-gate-label-not-eligible');
        else granted.push(contract);
      }
    } else if (!facts) reject(contract.operation, 'authority-facts-unavailable');
    else {
      const authority = facts.authority;
      if (![null, contract.target.taskId].includes(authority?.activeSlice))
        reject(contract.operation, 'authority-task-mismatch');
      else if (
        contract.target.artifactPaths.some(
          path =>
            facts.taskOwnedArtifacts[path]?.ownerTaskId !== contract.target.taskId ||
            facts.taskOwnedArtifacts[path]?.safeToDiscard !== true
        )
      )
        reject(contract.operation, 'artifact-discard-unverified');
      else if (
        authority?.activeSlice === contract.target.taskId &&
        authority.runtimeAuthorized === true
      )
        granted.push({ ...contract, deferred: true });
      else if (authority?.activeSlice === null && authority.runtimeAuthorized === false) {
        granted.push({ ...contract, deferred: false });
      } else reject(contract.operation, 'authority-state-unverified');
    }
  }
  return { facts, granted, rejected };
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
      resolution.facts &&
        resolution.facts.authority.runtimeAuthorized === false &&
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
  const digest = createHash('sha256').update(artifact.content).digest('hex');
  must(digest === artifact.sha256, 'capacity budget artifact digest differs');
  return digest;
}
