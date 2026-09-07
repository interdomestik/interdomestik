import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSnapshot, evaluateDeliverySnapshot } from './pr-delivery-gate.mjs';
import { B, H, T, TREE, contract, checksFor } from './pr-delivery-fixtures.mjs';

function fixture({ status = 'completed', conclusion = 'success', complete = true } = {}) {
  const feedbackCalls = [];
  const pull = { number: 1694, state: 'open', head: { sha: H }, base: { sha: B } };
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
      if (endpoint.endsWith('/pulls/1694')) return pull;
      const sha = endpoint.split('/').at(-1);
      assert.ok([B, H, T].includes(sha), endpoint);
      return { tree: { sha: TREE }, parents: (sha === T ? [B, H] : []).map(sha => ({ sha })) };
    },
    async pages(endpoint) {
      if (endpoint.endsWith('/files'))
        return { values: [{ filename: 'apps/web/src/page.tsx' }], complete: true };
      if (endpoint.includes('/check-runs?')) return { values: checks, complete };
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

test('governance diagnostics continue collecting feedback while checks are pending', async () => {
  const { client, feedbackCalls } = fixture({ status: 'in_progress', conclusion: null });
  const snapshot = await collectSnapshot(client, contract, expected, 1694);
  assert.equal(feedbackCalls.length, 4);
  assert.equal(snapshot.checks[0].status, 'in_progress');
});
