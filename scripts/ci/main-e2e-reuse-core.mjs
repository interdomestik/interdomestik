const EXPECTED_REPOSITORY = 'interdomestik/interdomestik';
const EXPECTED_WORKFLOW = '.github/workflows/e2e-pr.yml';
const SUCCESS = { reuse: true, reason: 'exact_pr_evidence' };
const REJECT = { reuse: false, reason: 'evidence_not_exact' };
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const positiveId = value => Number.isSafeInteger(value) && value > 0;
const nonEmpty = value => typeof value === 'string' && value.length > 0;
const sha = value => typeof value === 'string' && SHA_PATTERN.test(value);
const timestamp = value =>
  typeof value === 'string' && ISO_PATTERN.test(value) && Number.isFinite(Date.parse(value));
function exactRepository(repo, fullName, id) {
  return (
    positiveId(repo?.id) &&
    nonEmpty(repo.full_name) &&
    repo.full_name === fullName &&
    (id === undefined || repo.id === id)
  );
}
function associationRepository(repo, expected) {
  if (!positiveId(repo?.id) || !positiveId(expected?.id) || repo.id !== expected.id) return false;
  return repo.full_name === undefined || repo.full_name === expected.full_name;
}
function isMergedPullRequest(pr, context) {
  return (
    positiveId(pr?.id) &&
    positiveId(pr.number) &&
    pr.state === 'closed' &&
    timestamp(pr.merged_at) &&
    sha(pr.merge_commit_sha) &&
    pr.merge_commit_sha === context.githubSha &&
    pr.base?.ref === 'main' &&
    exactRepository(pr.base.repo, context.repository) &&
    nonEmpty(pr.head?.ref) &&
    sha(pr.head.sha) &&
    exactRepository(pr.head.repo, context.repository, pr.base.repo.id)
  );
}
function samePullRequest(candidate, selected) {
  const context = {
    githubSha: selected.merge_commit_sha,
    repository: selected.base.repo.full_name,
  };
  return (
    isMergedPullRequest(candidate, context) &&
    candidate.id === selected.id &&
    candidate.number === selected.number &&
    candidate.merged_at === selected.merged_at &&
    candidate.head.ref === selected.head.ref &&
    candidate.head.sha === selected.head.sha &&
    candidate.base.repo.id === selected.base.repo.id &&
    candidate.head.repo.id === selected.head.repo.id
  );
}
function sameDirectAssociation(candidate, selected) {
  return (
    positiveId(candidate?.id) &&
    positiveId(candidate.number) &&
    candidate.id === selected.id &&
    candidate.number === selected.number &&
    candidate.base?.ref === selected.base.ref &&
    associationRepository(candidate.base.repo, selected.base.repo) &&
    nonEmpty(candidate.head?.ref) &&
    sha(candidate.head.sha) &&
    candidate.head.ref === selected.head.ref &&
    candidate.head.sha === selected.head.sha &&
    associationRepository(candidate.head.repo, selected.head.repo)
  );
}
function hasExactAssociation(candidate, selected) {
  const direct = candidate?.run?.pull_requests;
  if (!Array.isArray(direct)) return false;
  if (direct.length > 0) return direct.length === 1 && sameDirectAssociation(direct[0], selected);
  const fallback = candidate.fallbackPullRequests;
  return Array.isArray(fallback) && fallback.length === 1 && samePullRequest(fallback[0], selected);
}
function hasSuccessfulRunner(jobs) {
  if (!Array.isArray(jobs)) return false;
  const runners = jobs.filter(job => job?.name === 'PR E2E Runner');
  return (
    runners.length === 1 &&
    positiveId(runners[0].id) &&
    runners[0].status === 'completed' &&
    runners[0].conclusion === 'success'
  );
}
function hasExactParity(parity) {
  return [
    'checkoutHead',
    'projectSuperset',
    'sharedFlags',
    'databaseSubstrate',
    'commandChain',
  ].every(key => parity?.[key] === true);
}
function isReusableCandidate(candidate, selected, context) {
  const run = candidate?.run;
  const ageMs = context.nowMs - Date.parse(run?.run_started_at);
  return (
    positiveId(run?.id) &&
    run.path === EXPECTED_WORKFLOW &&
    run.event === 'pull_request' &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    sha(run.head_sha) &&
    run.head_sha === selected.head.sha &&
    exactRepository(run.repository, context.repository, selected.base.repo.id) &&
    exactRepository(run.head_repository, context.repository, selected.head.repo.id) &&
    timestamp(run.run_started_at) &&
    ageMs >= -FUTURE_TOLERANCE_MS &&
    ageMs <= MAX_AGE_MS &&
    hasExactAssociation(candidate, selected) &&
    hasSuccessfulRunner(candidate.jobs)
  );
}
export function normalizeReuseDecision(value) {
  return value?.reuse === true && value?.reason === SUCCESS.reason ? { ...SUCCESS } : { ...REJECT };
}
export function decideMainE2eReuse(evidence) {
  const { context, local, pullRequests, headCommit, candidates, parity } = evidence ?? {};
  if (
    context?.eventName !== 'push' ||
    context.ref !== 'refs/heads/main' ||
    context.repository !== EXPECTED_REPOSITORY ||
    !sha(context.githubSha) ||
    !sha(local?.headSha) ||
    !sha(local.treeSha) ||
    local.headSha !== context.githubSha ||
    !Number.isFinite(context.nowMs) ||
    !hasExactParity(parity) ||
    !Array.isArray(pullRequests) ||
    pullRequests.length !== 1
  ) {
    return { ...REJECT };
  }
  const selected = pullRequests[0];
  const reusable =
    isMergedPullRequest(selected, context) &&
    sha(headCommit?.sha) &&
    sha(headCommit?.commit?.tree?.sha) &&
    headCommit.sha === selected.head.sha &&
    headCommit.commit.tree.sha === local.treeSha &&
    Array.isArray(candidates) &&
    candidates.some(candidate => isReusableCandidate(candidate, selected, context));
  return reusable ? { ...SUCCESS } : { ...REJECT };
}
