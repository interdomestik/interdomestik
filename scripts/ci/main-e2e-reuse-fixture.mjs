export const REPOSITORY = 'interdomestik/interdomestik';
export const MAIN_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const HEAD_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export const TREE_SHA = 'cccccccccccccccccccccccccccccccccccccccc';
export const NOW_MS = Date.parse('2026-08-13T16:00:00Z');

function repository() {
  return { id: 1_128_472_973, full_name: REPOSITORY };
}

export function reusablePullRequest() {
  return {
    id: 4_272_213_126,
    number: 1548,
    state: 'closed',
    merged_at: '2026-08-13T15:27:39Z',
    merge_commit_sha: MAIN_SHA,
    base: { ref: 'main', repo: repository() },
    head: {
      ref: 'codex/ci-main-e2e-db-parity-r1',
      sha: HEAD_SHA,
      repo: repository(),
    },
  };
}

export function reusableRun({ pullRequests = [] } = {}) {
  return {
    id: 31_712_197_425,
    path: '.github/workflows/e2e-pr.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: HEAD_SHA,
    run_started_at: '2026-08-13T14:50:50Z',
    repository: repository(),
    head_repository: repository(),
    pull_requests: pullRequests,
  };
}

export function directAssociation() {
  const pr = reusablePullRequest();
  return {
    id: pr.id,
    number: pr.number,
    base: { ref: pr.base.ref, sha: MAIN_SHA, repo: { id: pr.base.repo.id } },
    head: { ref: pr.head.ref, sha: pr.head.sha, repo: { id: pr.head.repo.id } },
  };
}

export function reusableEvidence({ direct = false } = {}) {
  const pr = reusablePullRequest();
  const run = reusableRun({ pullRequests: direct ? [directAssociation()] : [] });
  return {
    context: {
      eventName: 'push',
      ref: 'refs/heads/main',
      repository: REPOSITORY,
      githubSha: MAIN_SHA,
      nowMs: NOW_MS,
    },
    local: { headSha: MAIN_SHA, treeSha: TREE_SHA },
    pullRequests: [pr],
    headCommit: { sha: HEAD_SHA, commit: { tree: { sha: TREE_SHA } } },
    candidates: [
      {
        run,
        jobs: [
          {
            id: 94_487_829_021,
            name: 'PR E2E Runner',
            status: 'completed',
            conclusion: 'success',
          },
        ],
        fallbackPullRequests: direct ? undefined : [structuredClone(pr)],
      },
    ],
    parity: {
      checkoutHead: true,
      projectSuperset: true,
      sharedFlags: true,
      databaseSubstrate: true,
      commandChain: true,
    },
  };
}

function parts(value) {
  const pr = value.pullRequests[0];
  const candidate = value.candidates[0];
  return { pr, candidate, run: candidate.run, fallback: candidate.fallbackPullRequests?.[0] };
}
function removeMainSha(value) {
  const { pr, fallback } = parts(value);
  delete value.context.githubSha;
  delete value.local.headSha;
  delete pr.merge_commit_sha;
  delete fallback.merge_commit_sha;
}
function removeTreeSha(value) {
  delete value.local.treeSha;
  delete value.headCommit.commit.tree.sha;
}
function setTreeSha(value) {
  value.local.treeSha = 'not-a-full-tree-sha';
  value.headCommit.commit.tree.sha = 'not-a-full-tree-sha';
}
function setLinkedHeadSha(value, sha) {
  const { pr, run, fallback } = parts(value);
  pr.head.sha = sha;
  value.headCommit.sha = sha;
  run.head_sha = sha;
  fallback.head.sha = sha;
}
export const strictSchemaRejectionCases = [
  ['paired missing main SHAs', removeMainSha],
  ['paired missing tree SHAs', removeTreeSha],
  ['invalid linked tree SHAs', setTreeSha],
  ['empty linked head SHAs', value => setLinkedHeadSha(value, '')],
  ['invalid linked head SHAs', value => setLinkedHeadSha(value, 'not-a-full-sha')],
];

export const commandChainDrifts = [
  'playwrightReportArgs(process.env.PW_EVIDENCE_LANE)',
  "const fastEnv = { PW_FAST_GATES: '1' };",
  "const strictArgs = ['--max-failures=1', ...reportArgs];",
  "const strictWorkers = ['--workers=1', ...strictArgs];",
  "const gateArgs = ['e2e/gate', ...strictWorkers];",
  'gatekeeper: true,',
];
