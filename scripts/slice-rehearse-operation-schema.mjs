import {
  compareText,
  exactKeys,
  must,
  normalizeArtifactPath,
  normalizeCommitSha,
  normalizeGitBranch,
  normalizeOperationOrigin,
  normalizePullRequestNumber,
} from './slice-rehearse-canonical.mjs';

export const ROUTINE_OPERATIONS = Object.freeze([
  'add_focused_test',
  'apply_full_gate_label',
  'bounded_force_with_lease_rebuild',
  'derived_capacity_rebind',
  'extract_cohesive_helper',
  'fresh_worktree_patch_replay',
  'rerun_invalidated_proof',
  'sequence_prerequisite_before_projection',
  'split_focused_test',
  'task_owned_cleanup',
]);

const SENSITIVE = new Set(ROUTINE_OPERATIONS.filter(value => /force|label|cleanup/u.test(value)));
const TASK_ID = /^[A-Z0-9][A-Z0-9-]*$/u;
function normalizeForce(value) {
  exactKeys(
    value,
    ['operation', 'postconditions', 'preconditions', 'target'],
    'routine operation contract'
  );
  exactKeys(
    value.target,
    ['baseBranch', 'branch', 'headSha', 'origin', 'prNumber'],
    'force target'
  );
  exactKeys(value.preconditions, ['leaseSha'], 'force preconditions');
  exactKeys(value.postconditions, ['prHeadSha', 'remoteHeadSha'], 'force postconditions');
  const headSha = normalizeCommitSha(value.target.headSha, 'force target head');
  const postconditions = {
    prHeadSha: normalizeCommitSha(value.postconditions.prHeadSha, 'force PR postcondition'),
    remoteHeadSha: normalizeCommitSha(
      value.postconditions.remoteHeadSha,
      'force remote postcondition'
    ),
  };
  must(
    Object.values(postconditions).every(item => item === headSha),
    'force postconditions differ from target head'
  );
  return {
    operation: value.operation,
    target: {
      origin: normalizeOperationOrigin(value.target.origin),
      baseBranch: normalizeGitBranch(value.target.baseBranch),
      branch: normalizeGitBranch(value.target.branch),
      prNumber: normalizePullRequestNumber(value.target.prNumber),
      headSha,
    },
    preconditions: { leaseSha: normalizeCommitSha(value.preconditions.leaseSha, 'force lease') },
    postconditions,
  };
}
function normalizeFullGate(value, allowResolved) {
  if (value.target?.mode === 'deferred-pr') {
    const resolved = value.deferred === false;
    must(!resolved || allowResolved, 'resolved full-gate contract is execution-only');
    let contractKeys = ['operation', 'preconditions', 'target'];
    if (value.deferred === true) contractKeys = ['deferred', ...contractKeys];
    if (resolved)
      contractKeys = ['deferred', 'operation', 'preconditions', 'resolvedPrNumber', 'target'];
    exactKeys(value, contractKeys, 'routine operation contract');
    exactKeys(
      value.target,
      ['baseBranch', 'branch', 'label', 'mode', 'origin', 'taskId'],
      'deferred full-gate target'
    );
    exactKeys(
      value.preconditions,
      ['headEqualsBranchHead', 'labelAbsent', 'resolverWriterIdentity', 'uniquePullRequest'],
      'deferred full-gate preconditions'
    );
    must(
      Object.values(value.preconditions).every(item => item === true),
      'deferred predicates must be required'
    );
    must(value.target.label === 'full-gate', 'full-gate label is invalid');
    must(TASK_ID.test(value.target.taskId), 'deferred full-gate task is invalid');
    if (resolved) normalizePullRequestNumber(value.resolvedPrNumber);
    return {
      operation: value.operation,
      deferred: !resolved,
      ...(resolved ? { resolvedPrNumber: value.resolvedPrNumber } : {}),
      target: {
        mode: 'deferred-pr',
        origin: normalizeOperationOrigin(value.target.origin),
        baseBranch: normalizeGitBranch(value.target.baseBranch),
        branch: normalizeGitBranch(value.target.branch),
        label: 'full-gate',
        taskId: value.target.taskId,
      },
      preconditions: { ...value.preconditions },
    };
  }
  exactKeys(value, ['operation', 'preconditions', 'target'], 'routine operation contract');
  exactKeys(
    value.target,
    ['baseBranch', 'branch', 'headSha', 'label', 'origin', 'prNumber', 'taskId'],
    'full-gate target'
  );
  exactKeys(value.preconditions, ['labelAbsent', 'prHeadSha'], 'full-gate preconditions');
  must(
    value.target.label === 'full-gate' && value.preconditions.labelAbsent === true,
    'full-gate precondition is invalid'
  );
  const headSha = normalizeCommitSha(value.target.headSha, 'full-gate head');
  must(TASK_ID.test(value.target.taskId), 'full-gate task is invalid');
  must(
    headSha === normalizeCommitSha(value.preconditions.prHeadSha, 'full-gate PR head'),
    'full-gate target differs from PR head'
  );
  return {
    operation: value.operation,
    target: {
      origin: normalizeOperationOrigin(value.target.origin),
      baseBranch: normalizeGitBranch(value.target.baseBranch),
      branch: normalizeGitBranch(value.target.branch),
      prNumber: normalizePullRequestNumber(value.target.prNumber),
      headSha,
      label: 'full-gate',
      taskId: value.target.taskId,
    },
    preconditions: { prHeadSha: headSha, labelAbsent: true },
  };
}
function normalizeCleanup(value, allowResolved) {
  const resolved = value.deferred === false;
  must(!resolved || allowResolved, 'resolved cleanup contract is execution-only');
  exactKeys(
    value,
    typeof value.deferred === 'boolean'
      ? ['deferred', 'operation', 'preconditions', 'target']
      : ['operation', 'preconditions', 'target'],
    'routine operation contract'
  );
  exactKeys(value.target, ['artifactPaths', 'taskId'], 'cleanup target');
  exactKeys(value.preconditions, ['authorityInactive'], 'cleanup preconditions');
  must(
    value.preconditions.authorityInactive === true && TASK_ID.test(value.target.taskId),
    'cleanup precondition is invalid'
  );
  must(
    Array.isArray(value.target.artifactPaths) && value.target.artifactPaths.length,
    'cleanup artifacts are required'
  );
  const artifactPaths = value.target.artifactPaths.map(normalizeArtifactPath).sort(compareText);
  must(new Set(artifactPaths).size === artifactPaths.length, 'cleanup artifacts must be unique');
  return {
    operation: value.operation,
    deferred: !resolved,
    target: { taskId: value.target.taskId, artifactPaths },
    preconditions: { authorityInactive: true },
  };
}
export const routineOperationName = value => (typeof value === 'string' ? value : value.operation);
export function normalizeRoutineOperations(values, { allowResolved = false } = {}) {
  must(Array.isArray(values), 'routine operations must be an array');
  const normalized = [];
  for (const value of values) {
    if (typeof value === 'string') {
      must(ROUTINE_OPERATIONS.includes(value), `unknown routine operation: ${value}`);
      must(
        !SENSITIVE.has(value),
        `target-sensitive operation requires an exact contract: ${value}`
      );
      normalized.push(value);
      continue;
    }
    must(
      SENSITIVE.has(value?.operation),
      `unknown target-sensitive operation: ${value?.operation}`
    );
    if (value.operation === 'bounded_force_with_lease_rebuild') {
      normalized.push(normalizeForce(value));
      continue;
    }
    const contract =
      value.operation === 'apply_full_gate_label'
        ? normalizeFullGate(value, allowResolved)
        : normalizeCleanup(value, allowResolved);
    normalized.push(contract);
  }
  const names = normalized.map(routineOperationName);
  must(new Set(names).size === names.length, 'routine operations must be unique');
  return normalized.sort((left, right) =>
    compareText(routineOperationName(left), routineOperationName(right))
  );
}
