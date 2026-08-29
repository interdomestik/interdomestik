import { github } from './lean-current-authority-git.mjs';
import { ORIGIN } from './lean-current-authority-policy.mjs';
import {
  canonicalJson,
  compareText,
  deriveEvidenceIdentityKey,
  must,
  sha256,
  sortedText,
} from './slice-rehearse-canonical.mjs';
import { gitBytes } from './slice-rehearse-git-facts.mjs';
import {
  exactGitHubRepository,
  exactPullRequest,
  exactSuccessfulRunner,
  exactTimestamp,
  readGitBlobDigest,
} from './slice-rehearse-repository-facts.mjs';

const WORKFLOW_PATH = '.github/workflows/e2e-pr.yml';
const RUNNER_NAME = 'PR E2E Runner';
const CANONICAL_ORIGIN = `https://github.com/${ORIGIN}.git`;
const CANONICAL_COMMANDS = [
  'pnpm e2e:gate:pr',
  'pnpm --filter @interdomestik/web run e2e:smoke',
].sort(compareText);
const MAX_WORKFLOW_BYTES = 1024 * 1024;
const MAX_RUNS = 20;
const MAX_JOBS = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const SHA40 = /^[0-9a-f]{40}$/u;

function exactRun(run, pull, headSha, now) {
  const completedAt = exactTimestamp(run?.completed_at);
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
    exactGitHubRepository(run.repository, ORIGIN) &&
    exactGitHubRepository(run.head_repository, ORIGIN) &&
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
    const canonicalWriterPaths = sortedText(writerPaths);
    must(
      Array.isArray(evidenceReceipts) &&
        evidenceReceipts.some(receipt => receipt?.lane === 'pr-e2e'),
      'PR E2E receipt candidate is unavailable'
    );
    must(Array.isArray(proof?.commands), 'PR E2E command contract differs');
    const canonicalCommands = sortedText(proof.commands);
    must(
      JSON.stringify(canonicalCommands) === JSON.stringify(CANONICAL_COMMANDS),
      'PR E2E command contract differs'
    );
    const protectedWorkflowDigest = readGitBlobDigest(
      repository,
      protectedMainSha,
      WORKFLOW_PATH,
      MAX_WORKFLOW_BYTES,
      readGitBytes
    );
    const headWorkflowDigest = readGitBlobDigest(
      repository,
      headSha,
      WORKFLOW_PATH,
      MAX_WORKFLOW_BYTES,
      readGitBytes
    );
    must(
      proof.workflowDigest === protectedWorkflowDigest &&
        proof.substrateDigest === protectedWorkflowDigest &&
        headWorkflowDigest === protectedWorkflowDigest,
      'PR E2E workflow identity differs'
    );
    const pulls = readGithub(
      `repos/${ORIGIN}/commits/${headSha}/pulls?per_page=2&page=1`,
      repository
    );
    must(Array.isArray(pulls) && pulls.length === 1, 'GitHub PR association is not exact');
    const pull = pulls[0];
    must(exactPullRequest(pull, headSha, ORIGIN), 'GitHub PR identity differs');
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
        return {
          run,
          runner: exactSuccessfulRunner(jobsPayload.jobs, now, {
            runnerName: RUNNER_NAME,
            maxJobs: MAX_JOBS,
            maxAgeMs: MAX_AGE_MS,
            futureToleranceMs: FUTURE_TOLERANCE_MS,
          }),
        };
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
