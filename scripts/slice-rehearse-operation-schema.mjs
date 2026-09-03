import {
  compareText,
  exactKeys,
  must,
  normalizeArtifactPath,
  normalizeCommitSha,
  normalizeGitBranch,
  normalizeOperationOrigin,
  normalizePullRequestNumber,
  safeRelativePath,
  sha256,
  sortedUnique,
} from './slice-rehearse-canonical.mjs';
import { normalizeWriterLineage } from './slice-rehearse-capacity.mjs';

export const ROUTINE_OPERATIONS = Object.freeze(
  'add_focused_test apply_full_gate_label bounded_force_with_lease_rebuild compile_same_slice_delivery derived_capacity_rebind extract_cohesive_helper fresh_worktree_patch_replay rerun_invalidated_proof sequence_prerequisite_before_projection split_focused_test stale_pr_disposition task_owned_cleanup'.split(
    ' '
  )
);
const TASK = /^[A-Z0-9][A-Z0-9-]*$/u;
const keys = value => value.split(' ');
const TOP = keys('operation preconditions target');
const ROLES = keys('governance-transition product stale-prerequisite');
const ROLE = keys(
  'baseBranch baseSha branch changedPathDigest changedPaths headSha number role state'
);
const STAGES = keys(
  'stale-pr-disposition governance-transition resolver-activation product-reconciliation current-head-review-proof in-map-remediation invalidated-only-reruns final-head-heavy-proof conditional-merge protected-main-health deterministic-closeout authority-inactive owned-cleanup'
);
const AFTER = STAGES.slice(9);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fields(v, list) {
  exactKeys(v, list, 'operation');
  return Object.fromEntries(
    list.map(key => {
      let out = v[key];
      if (key === 'origin') out = normalizeOperationOrigin(out);
      else if (key === 'branch' || key.endsWith('Branch')) out = normalizeGitBranch(out);
      else if (key.endsWith('Sha')) out = normalizeCommitSha(out, key);
      else if (key === 'prNumber' || key === 'number') out = normalizePullRequestNumber(out);
      return [key, out];
    })
  );
}
function contract(v, target, pre, post, extra = []) {
  const out = fields(v, [...TOP, ...extra, ...(post ? ['postconditions'] : [])]);
  out.target = fields(v.target, target);
  out.preconditions = fields(v.preconditions, pre);
  if (post) out.postconditions = fields(v.postconditions, post);
  return out;
}
const task = v => must(TASK.test(v), 'invalid task');

export function normalizeDeliveryRole(v, extra = []) {
  const r = fields(v, [...ROLE, ...extra]);
  const paths = sortedUnique(r.changedPaths, 'delivery path', safeRelativePath);
  must(
    ROLES.includes(r.role) &&
      r.state === 'OPEN' &&
      r.changedPathDigest === sha256(JSON.stringify(paths)),
    'invalid role'
  );
  r.changedPaths = paths;
  return r;
}

export function normalizeStaleDisposition(v) {
  const out = contract(v, [...ROLE, 'origin', 'taskId'], keys('reason state'), ['state']);
  const t = (out.target = normalizeDeliveryRole(out.target, ['origin', 'taskId']));
  const { preconditions: pre, postconditions: post } = out;
  must(
    t.role === 'stale-prerequisite' &&
      pre.state === 'OPEN' &&
      post.state === 'CLOSED' &&
      pre.reason === 'superseded-by-same-slice-governance-transition' &&
      TASK.test(t.taskId),
    'invalid stale operation'
  );
  return out;
}

function force(v) {
  const out = contract(
    v,
    keys('baseBranch branch headSha origin prNumber'),
    ['leaseSha'],
    keys('prHeadSha remoteHeadSha')
  );
  const { target: t, postconditions: post } = out;
  must(
    Object.values(post).every(item => item === t.headSha),
    'force heads differ'
  );
  return out;
}
function fullGate(v, allow) {
  const deferred = v.target?.mode === 'deferred-pr';
  const done = v.deferred === false;
  const extra =
    deferred && typeof v.deferred === 'boolean'
      ? ['deferred', ...(done ? ['resolvedPrNumber'] : [])]
      : [];
  const out = contract(
    v,
    keys(
      deferred
        ? 'baseBranch branch label mode origin taskId'
        : 'baseBranch branch headSha label origin prNumber taskId'
    ),
    keys(
      deferred
        ? 'headEqualsBranchHead labelAbsent resolverWriterIdentity uniquePullRequest'
        : 'labelAbsent prHeadSha'
    ),
    null,
    extra
  );
  const { target: t, preconditions: pre } = out;
  task(t.taskId);
  if (deferred) must(!done || allow, 'full-gate is execution-only');
  must(
    t.label === 'full-gate' &&
      (deferred
        ? Object.values(pre).every(item => item === true)
        : pre.labelAbsent === true && t.headSha === pre.prHeadSha),
    'invalid full-gate'
  );
  if (deferred) {
    if (done) normalizePullRequestNumber(v.resolvedPrNumber);
    out.deferred = !done;
  }
  return out;
}
function cleanup(v, allow) {
  const done = v.deferred === false;
  must(!done || allow, 'cleanup is execution-only');
  const extra = typeof v.deferred === 'boolean' ? ['deferred'] : [];
  const out = contract(v, keys('artifactPaths taskId'), ['authorityInactive'], null, extra);
  const { target: t, preconditions: pre } = out;
  task(t.taskId);
  must(pre.authorityInactive === true, 'invalid cleanup');
  const paths = sortedUnique(t.artifactPaths, 'cleanup artifact', normalizeArtifactPath);
  must(paths.length, 'cleanup artifacts invalid');
  t.artifactPaths = paths;
  out.deferred = !done;
  return out;
}
function delivery(v) {
  const out = contract(
    v,
    keys('feedbackIds origin prRoles taskId writerLineage'),
    keys('maxBranches maxPullRequests maxRemediations maxSuccessfulHeavyProofs maxToolingRetries'),
    keys('mergeConsumesAuthority postMergeStages stages terminalOnMerge')
  );
  const { target: t, preconditions: pre, postconditions: post } = out;
  task(t.taskId);
  const roles = t.prRoles
    .map(role => normalizeDeliveryRole(role))
    .sort((a, b) => compareText(a.role, b.role));
  must(
    same(
      roles.map(role => role.role),
      ROLES
    ) && new Set(roles.map(role => role.number)).size === 3,
    'invalid roles'
  );
  must(
    same(Object.values(pre), [new Set(roles.map(role => role.branch)).size, 3, 1, 1, 3]),
    'invalid bounds'
  );
  must(same(Object.values(post), [true, AFTER, STAGES, true]), 'invalid lifecycle');
  const feedback = sortedUnique(t.feedbackIds, 'feedback identity');
  must(
    feedback.every(item => item.length <= 200),
    'bad feedback'
  );
  t.feedbackIds = feedback;
  t.prRoles = roles;
  t.writerLineage = normalizeWriterLineage(t.writerLineage, roles);
  post.stages = [...STAGES];
  post.postMergeStages = [...AFTER];
  return out;
}
const NORMALIZERS = {
  apply_full_gate_label: fullGate,
  bounded_force_with_lease_rebuild: force,
  compile_same_slice_delivery: delivery,
  stale_pr_disposition: normalizeStaleDisposition,
  task_owned_cleanup: cleanup,
};
export { STAGES };
export const routineOperationName = value => (typeof value === 'string' ? value : value.operation);
export function normalizeRoutineOperations(values, { allowResolved: allow = false } = {}) {
  must(Array.isArray(values), 'routine operations must be an array');
  const out = values.map(v => {
    const name = routineOperationName(v);
    const parse = NORMALIZERS[name];
    must(ROUTINE_OPERATIONS.includes(name), `unknown operation: ${name}`);
    must(typeof v === 'string' ? !parse : !!parse, `exact contract required: ${name}`);
    return typeof v === 'string' ? v : parse(v, allow);
  });
  const names = out.map(routineOperationName);
  must(new Set(names).size === names.length, 'routine operations must be unique');
  return out.sort((a, b) => compareText(routineOperationName(a), routineOperationName(b)));
}
