import assert from 'node:assert/strict';
import test from 'node:test';
import * as controller from './pr-feedback-controller.mjs';
import { repository } from './pr-feedback-refresh-fixtures.mjs';

function repositoryFixture(pages) {
  const requests = [];
  const reports = [];
  let index = 0;
  const client = {
    repository,
    async graphql(query, variables) {
      assert.match(query, /after:\$cursor/u);
      assert.equal(variables.cursor, index ? `page-${index}` : null);
      return { repository: { pullRequests: pages[index++] } };
    },
    async request(endpoint) {
      requests.push(endpoint);
      if (endpoint.includes('/actions/workflows/')) return { id: 20 };
      return { state: 'closed' };
    },
  };
  return { client, requests, reports, report: item => reports.push(item) };
}

test('repository refresh paginates more than twenty open PRs before any write', async () => {
  const f = repositoryFixture([
    {
      nodes: Array.from({ length: 20 }, (_, i) => ({ number: i + 1 })),
      pageInfo: { hasNextPage: true, endCursor: 'page-1' },
    },
    { nodes: [{ number: 21 }], pageInfo: { hasNextPage: false } },
  ]);
  const result = await controller.refreshRepository(f.client, { apply: true, report: f.report });
  assert.equal(result.failed, 0);
  assert.equal(f.reports.length, 42);
  assert.equal(f.requests.filter(path => path.endsWith('/pulls/21')).length, 2);
});

for (const malformed of [
  'missing-cursor',
  'repeated-cursor',
  'invalid-number',
  'duplicate-number',
  'bound',
]) {
  test(`repository inventory refuses ${malformed} before inspecting or writing PRs`, async () => {
    const pages = Array.from({ length: 100 }, (_, i) => ({
      nodes: [{ number: i + 1 }],
      pageInfo: { hasNextPage: true, endCursor: `page-${i + 1}` },
    }));
    if (malformed === 'missing-cursor') delete pages[0].pageInfo.endCursor;
    if (malformed === 'repeated-cursor') pages[1].pageInfo.endCursor = 'page-1';
    if (malformed === 'invalid-number') pages[0].nodes[0].number = '17';
    if (malformed === 'duplicate-number') pages[1].nodes[0].number = 1;
    const f = repositoryFixture(pages);
    await assert.rejects(controller.refreshRepository(f.client, { apply: true }), /inventory/u);
    assert.deepEqual(f.requests, []);
  });
}

test('one PR failure does not starve the next PR and diagnostics never echo API content', async () => {
  const f = repositoryFixture([
    { nodes: [{ number: 17 }, { number: 18 }], pageInfo: { hasNextPage: false } },
  ]);
  const request = f.client.request;
  f.client.request = endpoint => {
    if (endpoint.endsWith('/pulls/17')) throw new Error('secret API response\n::error::injected');
    return request(endpoint);
  };
  const result = await controller.refreshRepository(f.client, { apply: true, report: f.report });
  assert.equal(result.failed, 2);
  assert.equal(f.reports.length, 4);
  assert.deepEqual(
    f.reports.map(item => item.status),
    ['refresh-failed', 'refresh-failed', 'no-refresh', 'no-refresh']
  );
  assert.doesNotMatch(JSON.stringify(f.reports), /secret|injected/u);
});

test('workflow metadata failure does not starve the other workflow', async () => {
  const f = repositoryFixture([{ nodes: [{ number: 17 }], pageInfo: { hasNextPage: false } }]);
  const request = f.client.request;
  f.client.request = endpoint => {
    if (endpoint.endsWith('/pr-finalizer.yml')) throw new Error('API unavailable');
    return request(endpoint);
  };
  assert.equal((await controller.refreshRepository(f.client, { report: f.report })).failed, 1);
  assert.deepEqual(
    f.reports.map(item => item.status),
    ['refresh-failed', 'no-refresh']
  );
});
