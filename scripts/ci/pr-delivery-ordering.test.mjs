import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSnapshot, evaluateDeliverySnapshot } from './pr-delivery-gate.mjs';
import { B, H, T, TREE, contract, checksFor } from './pr-delivery-fixtures.mjs';

function fixture({
  status = 'completed',
  conclusion = 'success',
  complete = true,
  replacement = false,
} = {}) {
  const feedbackCalls = [];
  const replacementTitle = `PR delivery gate [supersession:v1:pull_request:synchronize:${H}]`;
  const pull = { number: 1694, state: 'open', draft: false, head: { sha: H }, base: { sha: B } };
  const checks = checksFor().map(item => ({
    ...item,
    name: item.context,
    head_sha: H,
    app: { id: item.appId },
    status,
    conclusion,
  }));
  const client = {
    repository: contract.repository,
    async cached(_key, loader) {
      return loader();
    },
    async runIdentity(item) {
      return { runId: item.runId, runAttempt: 1 };
    },
    async request(endpoint) {
      if (endpoint.endsWith('/pulls/1694')) return structuredClone(pull);
      if (endpoint.includes('/actions/runs/'))
        return {
          id: Number(endpoint.split('/').at(-1)),
          workflow_id: 20,
          head_sha: H,
          event: 'pull_request',
          display_title: replacementTitle,
        };
      const sha = endpoint.split('/').at(-1);
      assert.ok([B, H, T].includes(sha), endpoint);
      return { tree: { sha: TREE }, parents: (sha === T ? [B, H] : []).map(sha => ({ sha })) };
    },
    async pages(endpoint) {
      if (endpoint.endsWith('/files'))
        return { values: [{ filename: 'apps/web/src/page.tsx' }], complete: true };
      if (endpoint.includes('/check-runs?')) return { values: checks, complete };
      if (endpoint.includes('/actions/workflows/'))
        return {
          values: replacement
            ? [
                {
                  id: checks[0].runId + 1,
                  workflow_id: 20,
                  head_sha: H,
                  event: 'pull_request',
                  display_title: replacementTitle,
                  run_attempt: 1,
                  status: 'in_progress',
                },
              ]
            : [],
          complete: true,
        };
      if (!endpoint.endsWith('/annotations')) feedbackCalls.push(endpoint);
      return { values: [], complete: true };
    },
    async graphql() {
      feedbackCalls.push('threads');
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [],
              pageInfo: { hasNextPage: false },
            },
          },
        },
      };
    },
  };
  return { client, feedbackCalls, pull };
}
const expected = { base: B, head: H, testedMerge: T };
const collect = client =>
  collectSnapshot(client, contract, expected, 1694, [], { waitForPrerequisites: true });

test('delivery waits for prerequisites without repeatedly fetching review feedback', async () => {
  const { client, feedbackCalls } = fixture({ status: 'in_progress', conclusion: null });
  await assert.rejects(collect(client), /WAIT:/u);
  assert.deepEqual(feedbackCalls, []);
});

test('delivery still collects and validates fresh feedback once prerequisites pass', async () => {
  const { client, feedbackCalls } = fixture();
  const snapshot = await collect(client);
  assert.equal(feedbackCalls.length, 4);
  assert.equal(evaluateDeliverySnapshot(contract, snapshot).ok, true);
  snapshot.feedback.unresolvedThreads.push({ isResolved: false });
  assert.throws(() => evaluateDeliverySnapshot(contract, snapshot), /unresolved review threads/u);
});

test('failed or incomplete prerequisites cannot reach feedback attestation', async () => {
  for (const options of [{ conclusion: 'failure' }, { complete: false }]) {
    const { client, feedbackCalls } = fixture(options);
    await assert.rejects(collect(client), /failure|pagination incomplete/u);
    assert.deepEqual(feedbackCalls, []);
  }
});

test('superseded PR identity fails before feedback work', async () => {
  const { client, feedbackCalls, pull } = fixture();
  pull.head.sha = 'f'.repeat(40);
  await assert.rejects(collect(client), /pull request identity changed/u);
  assert.deepEqual(feedbackCalls, []);
});

test('a superseded failed wrapper waits for its newer producer without fetching feedback', async () => {
  const { client, feedbackCalls } = fixture({ conclusion: 'failure', replacement: true });
  await assert.rejects(collect(client), /WAIT: replacement workflow pending for audit/u);
  assert.deepEqual(feedbackCalls, []);
});

test('governance diagnostics continue collecting feedback while checks are pending', async () => {
  const { client, feedbackCalls } = fixture({ status: 'in_progress', conclusion: null });
  const snapshot = await collectSnapshot(client, contract, expected, 1694);
  assert.equal(feedbackCalls.length, 4);
  assert.equal(snapshot.checks[0].status, 'in_progress');
});

for (const [label, mutate] of [
  [
    'closed',
    pull => {
      pull.state = 'closed';
    },
  ],
  [
    'draft',
    pull => {
      pull.draft = true;
    },
  ],
  [
    'new head',
    pull => {
      pull.head = { sha: '9'.repeat(40) };
    },
  ],
  [
    'new base',
    pull => {
      pull.base = { sha: '9'.repeat(40) };
    },
  ],
]) {
  test(`delivery rejects ${label} PR observed after feedback collection`, async () => {
    const { client, pull } = fixture();
    const pages = client.pages.bind(client);
    client.pages = async endpoint => {
      const result = await pages(endpoint);
      if (endpoint.endsWith('/reviews')) mutate(pull);
      return result;
    };
    await assert.rejects(collect(client), /pull request identity changed/u);
  });
}

test('delivery rereads pending reviewers after feedback collection', async () => {
  const { client, pull } = fixture();
  const pages = client.pages.bind(client);
  client.pages = async endpoint => {
    const result = await pages(endpoint);
    if (endpoint.endsWith('/reviews')) {
      pull.requested_reviewers = [{ login: 'reviewer' }];
    }
    return result;
  };
  const snapshot = await collect(client);
  assert.throws(
    () => evaluateDeliverySnapshot(contract, snapshot),
    /WAIT: reviewers remain pending/u
  );
});

test('feedback retains immutable reviewer identity from REST evidence', async () => {
  const { client } = fixture();
  const pages = client.pages.bind(client);
  client.pages = async endpoint =>
    endpoint.endsWith('/reviews')
      ? {
          values: [
            {
              id: 5187830187,
              user: { id: 175728472, type: 'Bot', login: 'copilot-pull-request-reviewer[bot]' },
              commit_id: H,
              state: 'COMMENTED',
              body: '',
              submitted_at: '2026-09-12T20:06:11Z',
            },
          ],
          complete: true,
        }
      : pages(endpoint);
  const { feedback } = await collect(client);
  assert.equal(feedback.reviews[0].authorId, 175728472);
  assert.equal(feedback.reviews[0].authorType, 'Bot');
});

test('delivery fails closed when REST draft evidence is absent', async () => {
  const { client, pull } = fixture();
  delete pull.draft;
  await assert.rejects(collect(client), /pull request identity changed/u);
});

test('feedback retains absent author identity without inventing trusted evidence', async () => {
  const { client } = fixture();
  const pages = client.pages.bind(client);
  client.pages = async endpoint =>
    endpoint.endsWith('/reviews')
      ? { values: [{ id: 1, commit_id: H, state: 'COMMENTED', body: '' }], complete: true }
      : pages(endpoint);
  const { feedback } = await collect(client);
  assert.equal(feedback.reviews[0].authorId, null);
  assert.equal(feedback.reviews[0].authorType, '');
});

test('reviewer removed during collection requires one fresh poll', async () => {
  const { client, pull } = fixture();
  pull.requested_reviewers = [{ login: 'reviewer' }];
  const pages = client.pages.bind(client);
  client.pages = async endpoint => {
    const result = await pages(endpoint);
    if (endpoint.endsWith('/reviews')) pull.requested_reviewers = [];
    return result;
  };
  const first = await collect(client);
  assert.throws(() => evaluateDeliverySnapshot(contract, first), /WAIT: reviewers remain pending/u);
  assert.equal(evaluateDeliverySnapshot(contract, await collect(client)).ok, true);
});

test('a team newly requested during feedback collection remains pending', async () => {
  const { client, pull } = fixture();
  const pages = client.pages.bind(client);
  client.pages = async endpoint => {
    const result = await pages(endpoint);
    if (endpoint.endsWith('/reviews')) pull.requested_teams = [{ slug: 'security-review' }];
    return result;
  };
  const snapshot = await collect(client);
  assert.throws(
    () => evaluateDeliverySnapshot(contract, snapshot),
    /WAIT: reviewers remain pending/u
  );
});
