import assert from 'node:assert/strict';
import test from 'node:test';
import * as controller from './pr-feedback-controller.mjs';
import { repository } from './pr-feedback-refresh-fixtures.mjs';

test('quota-deferred PRs rotate without more network calls', async () => {
  const visited = [];
  for (const now of [0, 300000, 600000, 900000]) {
    const f = repositoryFixture([
      { nodes: [{ number: 17 }, { number: 18 }], pageInfo: { hasNextPage: false } },
    ]);
    f.client.budget = { reason: '' };
    const request = f.client.request;
    f.client.request = endpoint => {
      if (endpoint.includes('/pulls/')) f.client.budget.reason = 'shared-quota';
      return request(endpoint);
    };
    const result = await controller.refreshRepository(f.client, { now, report: f.report });
    assert.equal(result.failed, 0);
    assert.equal(result.deferred, 1);
    assert.equal(f.requests.filter(path => path.includes('/pulls/')).length, 1);
    assert.equal(f.reports.at(-1).status, 'deferred-budget');
    assert.equal(f.reports.at(-1).remainingPairs, 1);
    visited.push([f.reports[0].number, f.reports[0].workflow]);
  }
  assert.equal(new Set(visited.map(item => JSON.stringify(item))).size, 2);
});

test('an interrupted quota-bound inspection cannot claim no-refresh or hide deferral', async () => {
  const f = repositoryFixture([{ nodes: [{ number: 17 }], pageInfo: { hasNextPage: false } }]);
  f.client.budget = { reason: '' };
  const request = f.client.request;
  f.client.request = endpoint => {
    if (endpoint.includes('/pulls/')) {
      f.client.budget.reason = 'request-budget';
      throw new Error('feedback budget deferred');
    }
    return request(endpoint);
  };
  const result = await controller.refreshRepository(f.client, { now: 0, report: f.report });
  assert.equal(result.failed, 0);
  assert.equal(result.deferred, 1);
  assert.ok(f.reports.every(item => item.status === 'deferred-budget'));
});

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
  const result = await controller.refreshRepository(f.client, {
    now: 0,
    apply: true,
    report: f.report,
  });
  assert.equal(result.failed, 0);
  assert.equal(f.reports.length, 21);
  assert.equal(f.requests.filter(path => path.endsWith('/pulls/21')).length, 1);
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
  const result = await controller.refreshRepository(f.client, {
    now: 0,
    apply: true,
    report: f.report,
  });
  assert.equal(result.failed, 1);
  assert.equal(f.reports.length, 2);
  assert.deepEqual(
    f.reports.map(item => item.status),
    ['refresh-failed', 'no-refresh']
  );
  assert.doesNotMatch(JSON.stringify(f.reports), /secret|injected/u);
});

test('authoritative workflow metadata failure is explicit', async () => {
  const f = repositoryFixture([{ nodes: [{ number: 17 }], pageInfo: { hasNextPage: false } }]);
  const request = f.client.request;
  f.client.request = endpoint => {
    if (endpoint.endsWith('/pr-delivery-gate.yml')) throw new Error('API unavailable');
    return request(endpoint);
  };
  assert.equal(
    (await controller.refreshRepository(f.client, { now: 0, report: f.report })).failed,
    1
  );
  assert.deepEqual(
    f.reports.map(item => item.status),
    ['refresh-failed']
  );
});
