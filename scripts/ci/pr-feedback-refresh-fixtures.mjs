import assert from 'node:assert/strict';

export const repository = 'interdomestik/interdomestik';
export const base = '1'.repeat(40);
export const head = '2'.repeat(40);
export const merge = '3'.repeat(40);
export const digest = 'b'.repeat(64);

export function controllerFixture() {
  const evidence = validRefresh();
  const writes = [];
  let runReads = 0;
  const client = {
    repository,
    async request(endpoint) {
      if (endpoint.endsWith('/actions/workflows/20')) return structuredClone(evidence.workflow);
      if (endpoint.endsWith('/pulls/17')) return structuredClone(evidence.pull);
      if (endpoint.endsWith(`/actions/runs/${evidence.run.id}`)) {
        runReads++;
        return structuredClone(evidence.run);
      }
      if (endpoint.endsWith('/collaborators/maintainer/permission')) return evidence.permission;
      if (endpoint.endsWith('/git/commits/' + merge))
        return { parents: [{ sha: base }, { sha: head }] };
      assert.fail(endpoint);
    },
    async pages(endpoint, key) {
      if (
        endpoint ===
        `repos/${repository}/actions/workflows/20/runs?event=pull_request&head_sha=${'f'.repeat(40)}`
      ) {
        return { values: [], complete: true };
      }
      if (
        endpoint ===
        `repos/${repository}/actions/workflows/20/runs?event=pull_request&head_sha=${head}`
      ) {
        assert.equal(key, 'workflow_runs');
        return { values: [structuredClone(evidence.run)], complete: true };
      }
      if (
        endpoint ===
        `repos/${repository}/actions/runs/${evidence.run.id}/attempts/${evidence.run.run_attempt}/jobs`
      ) {
        assert.equal(key, 'jobs');
        return { values: structuredClone(evidence.jobs), complete: true };
      }
      assert.ok(
        ['/pulls/17/reviews', '/issues/17/comments', '/pulls/17/comments'].some(route =>
          endpoint.endsWith(route)
        ),
        endpoint
      );
      return { values: [], complete: true };
    },
    async graphql() {
      return {
        repository: {
          pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } } },
        },
      };
    },
    async response(endpoint, options) {
      writes.push({ endpoint, options });
      return { status: 201 };
    },
  };
  return { client, evidence, writes, runReads: () => runReads };
}

export function validRefresh() {
  return {
    now: Date.parse('2026-09-13T13:00:00Z'),
    pull: {
      number: 17,
      state: 'open',
      draft: false,
      merge_commit_sha: merge,
      base: { ref: 'main', sha: base, repo: { id: 1128472973, full_name: repository } },
      head: { ref: 'codex/fix', sha: head, repo: { id: 1128472973, full_name: repository } },
    },
    workflow: { id: 20, path: '.github/workflows/pr-delivery-gate.yml', state: 'active' },
    permission: { permission: 'write', user: { id: 7, login: 'maintainer', type: 'User' } },
    run: {
      id: 100,
      workflow_id: 20,
      path: '.github/workflows/pr-delivery-gate.yml',
      event: 'pull_request',
      head_sha: head,
      head_branch: 'codex/fix',
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
      created_at: '2026-09-13T12:00:00Z',
      actor: { id: 7, login: 'maintainer', type: 'User' },
      pull_requests: [],
      repository: { id: 1128472973, full_name: repository },
      head_repository: { id: 1128472973, full_name: repository },
      display_title: `PR delivery gate [supersession:v1:pull_request:opened:${head}]`,
    },
    jobs: [
      {
        id: 101,
        run_id: 100,
        run_attempt: 1,
        name: 'delivery-gate',
        status: 'completed',
        steps: [
          {
            number: 4,
            name: 'Node setup',
            status: 'completed',
            conclusion: 'success',
          },
          {
            number: 5,
            name: `feedback-snapshot:v1:17:${base}:${head}:${merge}:${'a'.repeat(64)}`,
            status: 'completed',
            conclusion: 'success',
          },
        ],
      },
    ],
    feedback: { number: 17, base, head, testedMerge: merge, digest },
  };
}
