import { github } from './lean-current-authority-git.mjs';
import { ORIGIN } from './lean-current-authority-policy.mjs';
import { canonicalJson, sha256 } from './slice-rehearse-core.mjs';
import { deriveEvidenceIdentityKey } from './slice-rehearse-evidence.mjs';
import { gitBytes } from './slice-rehearse-git-facts.mjs';

const WORKFLOW_PATH = '.github/workflows/e2e-pr.yml';
const RUNNER_NAME = 'PR E2E Runner';
const CANONICAL_ORIGIN = `https://github.com/${ORIGIN}.git`;
const CANONICAL_COMMANDS = [
  'pnpm e2e:gate:pr',
  'pnpm --filter @interdomestik/web run e2e:smoke',
].sort();
const MAX_WORKFLOW_BYTES = 1024 * 1024;
const MAX_RUNS = 20;
const MAX_JOBS = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const SHA40 = /^[0-9a-f]{40}$/u;

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function exactRepository(value) {
  return value?.full_name === ORIGIN && Number.isSafeInteger(value.id) && value.id > 0;
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return typeof value === 'string' && Number.isFinite(parsed) ? parsed : null;
}

function exactPull(pull, headSha) {
  return (
    Number.isSafeInteger(pull?.id) &&
    pull.id > 0 &&
    Number.isSafeInteger(pull?.number) &&
    pull.number > 0 &&
    pull.state === 'open' &&
    pull.base?.ref === 'main' &&
    exactRepository(pull.base?.repo) &&
    exactRepository(pull.head?.repo) &&
    pull.base.repo.id === pull.head.repo.id &&
    pull.head?.sha === headSha
  );
}

function exactRun(run, pull, headSha, now) {
  const completedAt = timestamp(run?.completed_at);
  const age = completedAt === null ? Number.POSITIVE_INFINITY : now - completedAt;
  const association = run?.pull_requests?.[0];
  return (
    Number.isSafeInteger(run?.id) &&
    run.id > 0 &&
    run.path === WORKFLOW_PATH &&
    run.event === 'pull_request' &&
    run.status === 'completed' &&
    run.conclusion === 'success' &&
    run.head_sha === headSha &&
    exactRepository(run.repository) &&
    exactRepository(run.head_repository) &&
    run.repository.id === pull.base.repo.id &&
    run.head_repository.id === pull.head.repo.id &&
    Array.isArray(run.pull_requests) &&
    run.pull_requests.length === 1 &&
    association?.id === pull.id &&
    association?.number === pull.number &&
    association?.base?.ref === pull.base.ref &&
    association?.base?.repo?.id === pull.base.repo.id &&
    association?.head?.sha === pull.head.sha &&
    association?.head?.repo?.id === pull.head.repo.id &&
    age >= -FUTURE_TOLERANCE_MS &&
    age <= MAX_AGE_MS
  );
}

function exactRunner(jobs, now) {
  must(Array.isArray(jobs) && jobs.length <= MAX_JOBS, 'GitHub job inventory is invalid');
  const matches = jobs.filter(job => job?.name === RUNNER_NAME);
  if (matches.length !== 1) return null;
  const runner = matches[0];
  const completedAt = timestamp(runner.completed_at);
  const age = completedAt === null ? Number.POSITIVE_INFINITY : now - completedAt;
  return Number.isSafeInteger(runner.id) &&
    runner.id > 0 &&
    runner.status === 'completed' &&
    runner.conclusion === 'success' &&
    age >= -FUTURE_TOLERANCE_MS &&
    age <= MAX_AGE_MS
    ? runner
    : null;
}

function readProtectedWorkflow(repository, protectedMainSha, readGitBytes) {
  must(SHA40.test(protectedMainSha), 'Protected-main SHA is invalid');
  const bytes = readGitBytes(repository, ['show', `${protectedMainSha}:${WORKFLOW_PATH}`]);
  must(Buffer.isBuffer(bytes), 'Protected workflow evidence is invalid');
  must(
    bytes.byteLength > 0 && bytes.byteLength <= MAX_WORKFLOW_BYTES,
    'Protected workflow is invalid'
  );
  return sha256(bytes);
}

export function collectVerifiedEvidenceKeys({
  repository,
  origin,
  providerRepository,
  protectedMainSha,
  headSha,
  treeSha,
  writerPaths,
  proof,
  evidenceReceipts,
  now = Date.now(),
  readGithub = (endpoint, repo) => github(endpoint, repo),
  readGitBytes = gitBytes,
}) {
  try {
    must(origin === CANONICAL_ORIGIN, 'GitHub origin is not canonical');
    must(providerRepository === ORIGIN, 'GitHub repository is not canonical');
    must(SHA40.test(headSha) && SHA40.test(treeSha), 'GitHub evidence SHA is invalid');
    must(
      Array.isArray(writerPaths) &&
        writerPaths.every(value => typeof value === 'string' && value.length > 0) &&
        new Set(writerPaths).size === writerPaths.length,
      'Writer map is invalid'
    );
    const canonicalWriterPaths = [...writerPaths].sort();
    must(
      Array.isArray(evidenceReceipts) &&
        evidenceReceipts.some(receipt => receipt?.lane === 'pr-e2e'),
      'PR E2E receipt candidate is unavailable'
    );
    must(Array.isArray(proof?.commands), 'PR E2E command contract differs');
    const canonicalCommands = [...proof.commands].sort();
    must(
      JSON.stringify(canonicalCommands) === JSON.stringify(CANONICAL_COMMANDS),
      'PR E2E command contract differs'
    );
    const protectedWorkflowDigest = readProtectedWorkflow(
      repository,
      protectedMainSha,
      readGitBytes
    );
    must(
      proof.workflowDigest === protectedWorkflowDigest &&
        proof.substrateDigest === protectedWorkflowDigest,
      'PR E2E workflow identity differs'
    );
    const pulls = readGithub(
      `repos/${ORIGIN}/commits/${headSha}/pulls?per_page=2&page=1`,
      repository
    );
    must(Array.isArray(pulls) && pulls.length === 1, 'GitHub PR association is not exact');
    const pull = pulls[0];
    must(exactPull(pull, headSha), 'GitHub PR identity differs');
    const runsPayload = readGithub(
      `repos/${ORIGIN}/actions/workflows/${encodeURIComponent(
        WORKFLOW_PATH
      )}/runs?event=pull_request&status=completed&head_sha=${headSha}&per_page=${MAX_RUNS}&page=1`,
      repository
    );
    must(
      Number.isSafeInteger(runsPayload?.total_count) &&
        runsPayload.total_count >= 0 &&
        runsPayload.total_count <= MAX_RUNS &&
        Array.isArray(runsPayload.workflow_runs) &&
        runsPayload.workflow_runs.length === runsPayload.total_count,
      'GitHub workflow inventory is invalid'
    );
    const candidates = runsPayload.workflow_runs
      .filter(run => exactRun(run, pull, headSha, now))
      .map(run => {
        const jobsPayload = readGithub(
          `repos/${ORIGIN}/actions/runs/${run.id}/jobs?per_page=${MAX_JOBS}&page=1`,
          repository
        );
        must(
          Number.isSafeInteger(jobsPayload?.total_count) &&
            jobsPayload.total_count >= 0 &&
            jobsPayload.total_count <= MAX_JOBS &&
            Array.isArray(jobsPayload.jobs) &&
            jobsPayload.jobs.length === jobsPayload.total_count,
          'GitHub job inventory is invalid'
        );
        return { run, runner: exactRunner(jobsPayload.jobs, now) };
      })
      .filter(candidate => candidate.runner)
      .sort(
        (left, right) =>
          Date.parse(right.runner.completed_at) - Date.parse(left.runner.completed_at) ||
          right.run.id - left.run.id
      );
    must(candidates.length > 0, 'GitHub PR E2E evidence is unavailable');
    const selected = candidates[0];
    const key = deriveEvidenceIdentityKey({
      lane: 'pr-e2e',
      headSha,
      treeSha,
      commandDigest: sha256(canonicalJson(canonicalCommands)),
      workflowDigest: proof.workflowDigest,
      substrateDigest: proof.substrateDigest,
      writerMapDigest: sha256(canonicalJson(canonicalWriterPaths)),
    });
    return {
      'pr-e2e': [
        {
          provider: 'github',
          key,
          checkId: selected.runner.id,
          runId: selected.run.id,
          completedAt: selected.runner.completed_at,
        },
      ],
    };
  } catch {
    return {};
  }
}
