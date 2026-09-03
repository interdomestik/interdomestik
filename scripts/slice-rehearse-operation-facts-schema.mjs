import { ORIGIN, SHA40 } from './lean-current-authority-policy.mjs';
import {
  compareText,
  exactKeys,
  isSafeGitBranch,
  must,
  normalizePullRequestNumber,
  safeRelativePath,
  sha256,
  sortedUnique,
} from './slice-rehearse-canonical.mjs';

const TASK = /^[A-Z0-9][A-Z0-9-]*$/u;
const keys = value => value.split(' ');
const ROLE_KEYS = keys(
  'baseBranch baseSha branch changedPathDigest changedPaths headSha number role state'
);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function expectedOperationFacts(operations) {
  const byName = name => operations.filter(value => value?.operation === name);
  const [force, labels, cleanup, delivery, stale] = keys(
    'bounded_force_with_lease_rebuild apply_full_gate_label task_owned_cleanup compile_same_slice_delivery stale_pr_disposition'
  ).map(byName);
  must(delivery.length <= 1 && stale.length <= 1, 'ambiguous');
  const roleByPr = Object.fromEntries(
    (delivery[0]?.target.prRoles ?? []).map(role => [String(role.number), role])
  );
  if (stale[0]) {
    const target = stale[0].target;
    const parent = delivery[0]?.target;
    const role = parent?.prRoles.find(item => item.role === 'stale-prerequisite');
    must(
      !parent ||
        (ROLE_KEYS.every(key => same(role?.[key], target[key])) &&
          parent.origin === target.origin &&
          parent.taskId === target.taskId),
      'stale drift'
    );
    roleByPr[target.number] = role ?? target;
  }
  const direct = [...force, ...labels.filter(item => item.target.mode !== 'deferred-pr')].map(
    item => String(item.target.prNumber)
  );
  return {
    branches: [...new Set(force.map(item => item.target.branch))].sort(compareText),
    prs: [...new Set([...direct, ...Object.keys(roleByPr)])].sort(compareText),
    roleByPr,
    deferredBranches: labels
      .filter(item => item.target.mode === 'deferred-pr')
      .map(item => item.target.branch)
      .sort(),
    cleanup: cleanup[0] ?? null,
    needsAuthority: cleanup.length > 0 || labels.length > 0,
  };
}

export const operationPullMatches = (pr, target, headSha) =>
  !!(
    pr &&
    pr.origin === target.origin &&
    pr.baseBranch === target.baseBranch &&
    pr.headSha === headSha &&
    pr.state === 'OPEN'
  );

export function resolveDeferredOperation(contract, repo, facts) {
  if (!facts) return { rejected: 'authority-facts-unavailable' };
  const { target } = contract;
  const pulls = facts.pullRequestCandidates[target.branch] ?? [];
  const { authority } = facts;
  const active =
    authority?.runtimeAuthorized === true &&
    authority.activeSlice === target.taskId &&
    authority.writerMapDigest === repo.writerMapDigest;
  const prePull =
    contract.deferred !== false &&
    pulls.length === 0 &&
    authority?.approvedHeadSha === null &&
    ((authority.runtimeAuthorized === false && authority.activeSlice === null) || active);
  if (prePull) return { deferred: contract };
  const candidate = pulls[0];
  const valid =
    pulls.length === 1 &&
    (contract.deferred !== false || candidate.number === contract.resolvedPrNumber) &&
    repo.branch === target.branch &&
    operationPullMatches(candidate, target, repo.headSha) &&
    candidate.branch === target.branch &&
    !candidate.fullGateLabelPresent &&
    candidate.fullGateEligible &&
    active &&
    authority.approvedHeadSha === repo.headSha;
  return valid
    ? { granted: { ...contract, deferred: false, resolvedPrNumber: candidate.number } }
    : { rejected: 'deferred-predicate-unresolved' };
}

function normalizePull(pull, { candidate = false, role = null } = {}) {
  exactKeys(
    pull,
    keys(
      `baseBranch branch fullGateEligible fullGateLabelPresent headSha ${candidate ? 'number ' : ''}origin ${role ? 'baseIsAncestor baseSha changedPathDigest changedPaths role ' : ''}state`
    ),
    'PR'
  );
  const { branch, baseBranch, headSha, fullGateEligible: e, fullGateLabelPresent: l } = pull;
  const changedPaths = role ? sortedUnique(pull.changedPaths, 'PR path', safeRelativePath) : null;
  must(
    isSafeGitBranch(branch) &&
      isSafeGitBranch(baseBranch) &&
      SHA40.test(headSha) &&
      pull.origin === `https://github.com/${ORIGIN}` &&
      (pull.state === 'OPEN' || (role && pull.state === 'CLOSED')) &&
      typeof l === 'boolean' &&
      typeof e === 'boolean' &&
      e === (pull.state === 'OPEN' && !l) &&
      (!candidate || normalizePullRequestNumber(pull.number)) &&
      (!role ||
        (ROLE_KEYS.every(
          key => ['changedPaths', 'number', 'state'].includes(key) || same(pull[key], role[key])
        ) &&
          same(changedPaths, role.changedPaths) &&
          pull.changedPathDigest === sha256(JSON.stringify(changedPaths)) &&
          pull.baseIsAncestor === true &&
          SHA40.test(pull.baseSha))),
    'invalid PR'
  );
  return { ...pull, ...(role && { changedPaths }) };
}

function exactMap(input, names, normalize) {
  exactKeys(input, names, 'facts');
  return Object.fromEntries(names.map(name => [name, normalize(input[name], name)]));
}

export function normalizeOperationFacts(input, operations) {
  if (input == null) return null;
  exactKeys(
    input,
    keys('authority pullRequestCandidates pullRequests remoteHeads taskOwnedArtifacts'),
    'facts'
  );
  const scope = expectedOperationFacts(operations);
  const heads = exactMap(input.remoteHeads, scope.branches, (head, branch) => {
    must(isSafeGitBranch(branch) && SHA40.test(head), 'invalid remote head');
    return head;
  });
  const pulls = exactMap(input.pullRequests, scope.prs, (pull, number) =>
    normalizePull(pull, { role: scope.roleByPr[number] ?? null })
  );
  const candidates = exactMap(input.pullRequestCandidates, scope.deferredBranches, values => {
    must(Array.isArray(values) && values.length <= 2, 'invalid PR candidates');
    return values.map(candidate => normalizePull(candidate, { candidate: true }));
  });
  let { authority } = input;
  if (scope.needsAuthority) {
    exactKeys(
      authority,
      keys('activeSlice approvedHeadSha runtimeAuthorized writerMapDigest'),
      'operation authority'
    );
    must(
      (authority.activeSlice === null || TASK.test(authority.activeSlice)) &&
        typeof authority.runtimeAuthorized === 'boolean' &&
        (authority.approvedHeadSha === null || SHA40.test(authority.approvedHeadSha)) &&
        (authority.writerMapDigest === null || /^[0-9a-f]{64}$/u.test(authority.writerMapDigest)),
      'invalid operation authority'
    );
    authority = { ...authority };
  } else must(authority === null, 'unexpected authority facts');
  const paths = scope.cleanup?.target.artifactPaths ?? [];
  const artifacts = exactMap(input.taskOwnedArtifacts, paths, artifact => {
    exactKeys(artifact, keys('exists ownerTaskId safeToDiscard'), 'artifact');
    must(
      typeof artifact.exists === 'boolean' &&
        typeof artifact.safeToDiscard === 'boolean' &&
        (artifact.ownerTaskId === null || TASK.test(artifact.ownerTaskId)),
      'invalid artifact'
    );
    return { ...artifact };
  });
  return {
    authority,
    pullRequestCandidates: candidates,
    pullRequests: pulls,
    remoteHeads: heads,
    taskOwnedArtifacts: artifacts,
  };
}
