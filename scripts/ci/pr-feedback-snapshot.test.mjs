import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validRefresh, repository, base, head, merge } from './pr-feedback-refresh-fixtures.mjs';
import { parseFeedbackMarker } from './pr-feedback-refresh.mjs';

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

test('marker recording preserves the successful digest and publishes exactly once', async () => {
  const { captureFeedback, recordFeedbackMarker } = await implementation();
  const client = feedbackClient();
  const expected = { base, head, testedMerge: merge };
  const captured = await captureFeedback(client, 17, expected);
  const markers = [];
  await recordFeedbackMarker(client, 17, expected, marker => markers.push(marker));
  assert.equal(markers.length, 1);
  assert.deepEqual(parseFeedbackMarker(markers[0]), captured);
});

for (const failure of ['transport', 'pagination', 'head', 'merge']) {
  test(`failed ${failure} capture retains only an unavailable source-bound recovery marker`, async () => {
    const { recordFeedbackMarker } = await implementation();
    const client = feedbackClient();
    const pages = client.pages;
    client.pages = async endpoint => {
      if (failure === 'transport') throw new Error('transient API failure');
      const result = await pages(endpoint);
      if (failure === 'pagination') result.complete = false;
      if (failure === 'head') client.pull.head.sha = 'f'.repeat(40);
      if (failure === 'merge') client.pull.merge_commit_sha = 'f'.repeat(40);
      return result;
    };
    const markers = [];
    await assert.rejects(
      recordFeedbackMarker(client, 17, { base, head, testedMerge: merge }, marker =>
        markers.push(marker)
      ),
      /transient|pagination|identity/u
    );
    assert.equal(markers.length, 1);
    assert.deepEqual(parseFeedbackMarker(markers[0]), {
      number: 17,
      base,
      head,
      testedMerge: merge,
      digest: 'unavailable',
    });
  });
}

test('invalid recording identities cannot publish a marker or make a request', async () => {
  const { recordFeedbackMarker } = await implementation();
  for (const mutation of ['repository', 'number', 'base', 'head', 'testedMerge']) {
    const client = feedbackClient();
    let calls = 0;
    client.request = async () => {
      calls++;
      throw new Error('unexpected request');
    };
    const expected = { base, head, testedMerge: merge };
    if (mutation === 'repository') client.repository = 'other/repository';
    if (['base', 'head', 'testedMerge'].includes(mutation))
      expected[mutation] = 'invalid\nmarker=x';
    const markers = [];
    await assert.rejects(
      recordFeedbackMarker(client, mutation === 'number' ? 0 : 17, expected, marker =>
        markers.push(marker)
      ),
      /identity/u
    );
    assert.deepEqual(markers, []);
    assert.equal(calls, 0);
  }
});

test('the native capture command records unavailable output but still exits unsuccessfully', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'feedback-marker-'));
  const output = path.join(directory, 'output');
  try {
    const preload =
      'data:text/javascript,' +
      encodeURIComponent(
        "globalThis.fetch = async () => { throw new Error('temporary API outage'); };"
      );
    const result = spawnSync(process.execPath, ['--import', preload, fileURLToPath(moduleUrl)], {
      encoding: 'utf8',
      env: {
        GITHUB_REPOSITORY: repository,
        GITHUB_TOKEN: 'fixture-token',
        GITHUB_OUTPUT: output,
        PR_NUMBER: '17',
        EXPECTED_BASE_SHA: base,
        EXPECTED_HEAD_SHA: head,
        EXPECTED_TESTED_MERGE_SHA: merge,
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /temporary API outage/u);
    assert.equal(
      fs.readFileSync(output, 'utf8'),
      `marker=feedback-snapshot:v1:17:${base}:${head}:${merge}:unavailable\n`
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

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
