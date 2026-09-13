export const repository = 'interdomestik/interdomestik';
export const base = '1'.repeat(40);
export const head = '2'.repeat(40);
export const merge = '3'.repeat(40);
export const digest = 'b'.repeat(64);

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
