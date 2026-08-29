import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson, sha256 } from './slice-rehearse-core.mjs';
import { deriveEvidenceIdentityKey, evaluateEvidenceReceipts } from './slice-rehearse-evidence.mjs';
import { collectVerifiedEvidenceKeys } from './slice-rehearse-github-evidence.mjs';

const headSha = 'a'.repeat(40);
const treeSha = 'b'.repeat(40);
const protectedMainSha = 'c'.repeat(40);
const workflow = Buffer.from('name: protected PR E2E\n');
const workflowDigest = sha256(workflow);
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
    completed_at: '2026-08-29T11:45:00.000Z',
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
  return endpoint => {
    if (endpoint.includes(`/commits/${headSha}/pulls`)) return pulls;
    if (endpoint.includes('/actions/workflows/')) {
      return { total_count: runs.length, workflow_runs: runs };
    }
    if (endpoint.includes('/actions/runs/77/jobs')) {
      return { total_count: runnerJobs.length, jobs: runnerJobs };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
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
    proof: { commands, workflowDigest, substrateDigest: workflowDigest },
    evidenceReceipts: [{ lane: 'pr-e2e' }],
    now,
    readGitBytes: () => workflow,
    readGithub: githubReader(),
    ...overrides,
  });
}

test('collects an exact protected-workflow PR E2E receipt key from independent GitHub facts', () => {
  const result = collect();
  assert.deepEqual(result, {
    'pr-e2e': [
      {
        provider: 'github',
        key: deriveEvidenceIdentityKey({
          lane: 'pr-e2e',
          headSha,
          treeSha,
          commandDigest: sha256(canonicalJson([...commands].sort())),
          workflowDigest,
          substrateDigest: workflowDigest,
          writerMapDigest: sha256(canonicalJson(writerPaths)),
        }),
        checkId: 88,
        runId: 77,
        completedAt: '2026-08-29T11:44:00.000Z',
      },
    ],
  });

  const identity = {
    headSha,
    treeSha,
    commandDigest: sha256(canonicalJson([...commands].sort())),
    workflowDigest,
    substrateDigest: workflowDigest,
    writerMapDigest: sha256(canonicalJson(writerPaths)),
  };
  const decision = evaluateEvidenceReceipts({
    receipts: [
      {
        lane: 'pr-e2e',
        ...identity,
        status: 'success',
        expiresAt: '2026-08-30T00:00:00.000Z',
      },
    ],
    heavyLanes: ['pr-e2e'],
    expectedByLane: { 'pr-e2e': identity },
    verifiedEvidenceKeysByLane: result,
    dirtyWriterPaths: [],
    now,
  });
  assert.deepEqual(decision.reusableLanes, ['pr-e2e']);
  assert.deepEqual(decision.missingLanes, []);
});

test('canonicalizes command and writer ordering before deriving reusable evidence identity', () => {
  const reversedCommands = [...commands].reverse();
  const reversedWriters = ['scripts/z-last.mjs', 'scripts/a-first.mjs'];
  const canonicalWriters = [...reversedWriters].sort();
  const result = collect({
    proof: {
      commands: reversedCommands,
      workflowDigest,
      substrateDigest: workflowDigest,
    },
    writerPaths: reversedWriters,
  });
  assert.equal(
    result['pr-e2e'][0].key,
    deriveEvidenceIdentityKey({
      lane: 'pr-e2e',
      headSha,
      treeSha,
      commandDigest: sha256(canonicalJson([...commands].sort())),
      workflowDigest,
      substrateDigest: workflowDigest,
      writerMapDigest: sha256(canonicalJson(canonicalWriters)),
    })
  );
});

test('rejects stale, mismatched, ambiguous, and unsuccessful evidence', () => {
  assert.deepEqual(
    collect({
      readGithub: githubReader({
        runs: [run({ completed_at: '2026-08-27T00:00:00.000Z' })],
      }),
    }),
    {}
  );
  assert.deepEqual(
    collect({
      proof: { commands: ['pnpm e2e:gate:pr'], workflowDigest, substrateDigest: workflowDigest },
    }),
    {}
  );
  assert.deepEqual(collect({ readGithub: githubReader({ pulls: [pull(), pull()] }) }), {});
  assert.deepEqual(
    collect({
      readGithub: githubReader({
        jobs: [
          {
            id: 88,
            name: 'PR E2E Runner',
            status: 'completed',
            conclusion: 'failure',
            completed_at: '2026-08-29T11:44:00.000Z',
          },
        ],
      }),
    }),
    {}
  );
});

test('rejects workflow or substrate digests not anchored to protected main', () => {
  assert.deepEqual(
    collect({
      proof: { commands, workflowDigest: 'd'.repeat(64), substrateDigest: workflowDigest },
    }),
    {}
  );
  assert.deepEqual(
    collect({
      proof: { commands, workflowDigest, substrateDigest: 'e'.repeat(64) },
    }),
    {}
  );
});

test('rejects reuse when the PR head executed a different workflow blob', () => {
  const changedHeadWorkflow = Buffer.from('name: weakened PR E2E\n');
  assert.deepEqual(
    collect({
      writerPaths: [...writerPaths, '.github/workflows/e2e-pr.yml'],
      readGitBytes: (_repository, args) =>
        args[1].startsWith(`${headSha}:`) ? changedHeadWorkflow : workflow,
    }),
    {}
  );
});
