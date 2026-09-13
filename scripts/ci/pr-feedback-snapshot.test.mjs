import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validRefresh, repository, base, head, merge } from './pr-feedback-refresh-fixtures.mjs';

const moduleUrl = new URL('./pr-feedback-snapshot.mjs', import.meta.url);
async function implementation() {
  assert.ok(fs.existsSync(moduleUrl), 'feedback snapshot implementation is not present');
  return import(moduleUrl);
}
export function feedbackClient() {
  const pull = validRefresh().pull;
  const data = { reviews: [], issueComments: [], comments: [], threads: [] };
  return {
    repository,
    pull,
    data,
    async request(endpoint) {
      if (endpoint === `repos/${repository}/pulls/17`) return structuredClone(pull);
      assert.equal(endpoint, `repos/${repository}/git/commits/${merge}`);
      return { parents: [{ sha: base }, { sha: head }] };
    },
    async pages(endpoint) {
      const route = new Map([
        [`repos/${repository}/pulls/17/reviews`, data.reviews],
        [`repos/${repository}/issues/17/comments`, data.issueComments],
        [`repos/${repository}/pulls/17/comments`, data.comments],
      ]);
      assert.ok(route.has(endpoint), endpoint);
      return { values: structuredClone(route.get(endpoint)), complete: true };
    },
    async graphql() {
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: data.threads,
              pageInfo: { hasNextPage: false },
            },
          },
        },
      };
    },
  };
}

test('feedback digest changes for review edits, dismissals, deletion and thread resolution', async () => {
  const { captureFeedback } = await implementation();
  const client = feedbackClient();
  client.data.reviews.push({
    id: 1,
    user: { id: 4, type: 'Bot', login: 'copilot' },
    commit_id: head,
    state: 'COMMENTED',
    body: 'original',
  });
  const expected = { base, head, testedMerge: merge };
  const initial = await captureFeedback(client, 17, expected);
  for (const change of [
    () => {
      client.data.reviews[0].body = 'edited';
    },
    () => {
      client.data.reviews[0].state = 'DISMISSED';
    },
    () => {
      client.data.reviews = [];
    },
    () => {
      client.data.threads = [
        { isResolved: false, comments: { nodes: [], pageInfo: { hasNextPage: false } } },
      ];
    },
    () => {
      client.data.threads[0].isResolved = true;
    },
  ]) {
    const before = await captureFeedback(client, 17, expected);
    change();
    assert.notEqual((await captureFeedback(client, 17, expected)).digest, before.digest);
  }
  assert.equal(initial.number, 17);
  assert.match(initial.digest, /^[a-f0-9]{64}$/u);
});

test('feedback snapshot refuses incomplete pagination and post-collection source drift', async () => {
  const { captureFeedback } = await implementation();
  for (const mutation of ['pagination', 'head', 'draft', 'merge']) {
    const client = feedbackClient();
    const pages = client.pages;
    client.pages = async endpoint => {
      const result = await pages(endpoint);
      if (mutation === 'pagination') result.complete = false;
      if (mutation === 'head') client.pull.head.sha = 'f'.repeat(40);
      if (mutation === 'draft') client.pull.draft = true;
      if (mutation === 'merge') client.pull.merge_commit_sha = 'f'.repeat(40);
      return result;
    };
    await assert.rejects(
      captureFeedback(client, 17, { base, head, testedMerge: merge }),
      /identity|pagination/u
    );
  }
});

test('feedback digest ignores response ordering but detects new pending reviewers', async () => {
  const { captureFeedback } = await implementation();
  const client = feedbackClient();
  client.data.reviews = [
    { id: 1, body: 'one' },
    { id: 2, body: 'two' },
  ];
  const expected = { base, head, testedMerge: merge };
  const before = await captureFeedback(client, 17, expected);
  client.data.reviews.reverse();
  assert.equal((await captureFeedback(client, 17, expected)).digest, before.digest);
  client.pull.requested_reviewers = [{ login: 'human' }];
  assert.notEqual((await captureFeedback(client, 17, expected)).digest, before.digest);
});

test('ordinary issue comment bodies, timestamps and deletion do not refresh gates', async () => {
  const { captureFeedback } = await implementation();
  const client = feedbackClient();
  const expected = { base, head, testedMerge: merge };
  const before = await captureFeedback(client, 17, expected);
  client.data.issueComments = [{ user: { login: 'human' }, body: 'hello', updated_at: 'one' }];
  assert.equal((await captureFeedback(client, 17, expected)).digest, before.digest);
  client.data.issueComments[0].body = 'edited conversation';
  client.data.issueComments[0].updated_at = 'two';
  assert.equal((await captureFeedback(client, 17, expected)).digest, before.digest);
  client.data.issueComments = [];
  assert.equal((await captureFeedback(client, 17, expected)).digest, before.digest);
});

test('bot issue author presence is retained, but redundant bodies and timestamps are not', async () => {
  const { captureFeedback } = await implementation();
  const client = feedbackClient();
  const expected = { base, head, testedMerge: merge };
  const initial = (await captureFeedback(client, 17, expected)).digest;
  for (const author of ['unrecognized[bot]', 'copilot', 'copilot-pull-request-reviewer']) {
    client.data.issueComments = [{ user: { login: author }, body: 'one', updated_at: 'one' }];
    const present = (await captureFeedback(client, 17, expected)).digest;
    assert.notEqual(present, initial, 'unknown bot identities must remain visible to the gate');
    client.data.issueComments.push({ user: { login: author }, body: 'two', updated_at: 'two' });
    assert.equal((await captureFeedback(client, 17, expected)).digest, present);
    client.data.issueComments = [];
    assert.equal((await captureFeedback(client, 17, expected)).digest, initial);
  }
});

test('trusted disposition edits, deletion and permission revocation still refresh gates', async () => {
  const { captureFeedback } = await implementation();
  const client = feedbackClient();
  const expected = { base, head, testedMerge: merge };
  let permission = 'write';
  const request = client.request;
  client.request = endpoint =>
    endpoint.endsWith('/collaborators/human/permission') ? { permission } : request(endpoint);
  const initial = (await captureFeedback(client, 17, expected)).digest;
  const disposition = {
    user: { login: 'human' },
    author_association: 'COLLABORATOR',
    body: `<!-- pr-delivery-disposition:v1 review=1 head=${head} -->`,
  };
  client.data.issueComments = [disposition];
  const trusted = (await captureFeedback(client, 17, expected)).digest;
  assert.notEqual(trusted, initial);
  disposition.body = `<!-- pr-delivery-disposition:v1 review=2 head=${head} -->`;
  assert.notEqual((await captureFeedback(client, 17, expected)).digest, trusted);
  permission = 'read';
  assert.equal((await captureFeedback(client, 17, expected)).digest, initial);
  permission = 'write';
  client.data.issueComments = [];
  assert.equal((await captureFeedback(client, 17, expected)).digest, initial);
});
