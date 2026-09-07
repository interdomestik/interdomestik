import { sha256 } from './slice-rehearse-core.mjs';
import { collectVerifiedEvidenceKeys } from './slice-rehearse-github-evidence.mjs';
import { derivePrE2eSubstrateDigest } from './slice-rehearse-repository-facts.mjs';

const headSha = 'a'.repeat(40);
const treeSha = 'b'.repeat(40);
const protectedMainSha = 'c'.repeat(40);
const workflow = Buffer.from(`name: protected PR E2E
jobs:
  e2e-runner:
    name: PR E2E Runner
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
    steps:
      - uses: ./.github/actions/setup
  e2e:
    name: e2e
`);
const setupAction = Buffer.from('name: setup\nruns: { using: composite, steps: [] }\n');
const workflowDigest = sha256(workflow);
const substrateDigest = derivePrE2eSubstrateDigest(workflow, setupAction);
const commands = ['pnpm e2e:gate:pr', 'pnpm --filter @interdomestik/web run e2e:smoke'];
const writerPaths = ['scripts/example.mjs'];
const now = Date.parse('2026-08-29T12:00:00.000Z');

function pull() {
  const repository = { id: 7, full_name: 'interdomestik/interdomestik' };
  return {
    id: 166400,
    number: 1664,
    state: 'open',
    base: { ref: 'main', repo: repository },
    head: { sha: headSha, repo: repository },
  };
}

function run(overrides = {}) {
  const repository = { id: 7, full_name: 'interdomestik/interdomestik' };
  return {
    id: 77,
    run_attempt: 1,
    path: '.github/workflows/e2e-pr.yml',
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    head_sha: headSha,
    repository,
    head_repository: repository,
    pull_requests: [
      {
        id: 166400,
        number: 1664,
        base: { ref: 'main', repo: repository },
        head: { sha: headSha, repo: repository },
      },
    ],
    completed_at: null,
    updated_at: '2026-08-29T11:45:00.000Z',
    ...overrides,
  };
}

function githubReader({ pulls = [pull()], runs = [run()], jobs } = {}) {
  const runnerJobs = jobs ?? [
    {
      id: 88,
      name: 'PR E2E Runner',
      status: 'completed',
      conclusion: 'success',
      completed_at: '2026-08-29T11:44:00.000Z',
    },
  ];
  const responses = [
    [`/commits/${headSha}/pulls`, pulls],
    ['/actions/workflows/', { total_count: runs.length, workflow_runs: runs }],
    ['/actions/runs/77/jobs', { total_count: runnerJobs.length, jobs: runnerJobs }],
  ];
  return endpoint => {
    const response = responses.find(([route]) => endpoint.includes(route));
    if (!response) throw new Error(`Unexpected endpoint: ${endpoint}`);
    return response[1];
  };
}

function proofInputs() {
  return {
    baseSha: protectedMainSha,
    headSha,
    treeSha,
    ...Object.fromEntries(
      [
        'configSha256',
        'selectionSha256',
        'substrateSha256',
        'producerSha256',
        'verifierSha256',
        'requiredContextsAppsSha256',
        'reviewSha256',
      ].map(key => [key, 'd'.repeat(64)])
    ),
    externalSources: [],
  };
}

function collect(overrides = {}) {
  return collectVerifiedEvidenceKeys({
    repository: '/repo',
    origin: 'https://github.com/interdomestik/interdomestik.git',
    providerRepository: 'interdomestik/interdomestik',
    protectedMainSha,
    headSha,
    treeSha,
    writerPaths,
    proof: { commands, workflowDigest, substrateDigest },
    evidenceReceipts: [{ lane: 'pr-e2e' }],
    previousProofInputs: proofInputs(),
    currentProofInputs: proofInputs(),
    now,
    readGitBytes: (_repository, args) =>
      args[1].endsWith(':.github/actions/setup/action.yml') ? setupAction : workflow,
    readGithub: githubReader(),
    ...overrides,
  });
}

export {
  headSha,
  treeSha,
  protectedMainSha,
  workflow,
  setupAction,
  workflowDigest,
  substrateDigest,
  commands,
  writerPaths,
  now,
  pull,
  run,
  githubReader,
  collect,
  proofInputs,
};
