import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRefreshClient } from './pr-feedback-budget.mjs';
import { refreshOne, refreshRepository } from './pr-feedback-controller.mjs';
import { controllerFixture } from './pr-feedback-refresh-fixtures.mjs';

async function fixture(response = {}) {
  let calls = 0;
  const client = createRefreshClient('fixture-token', async () => {
    calls++;
    return new Response('{}', {
      status: response.status ?? 200,
      headers: response.headers ?? {
        'x-ratelimit-resource': 'core',
        'x-ratelimit-remaining': '900',
      },
    });
  });
  return { client, calls: () => calls };
}
const endpoint = 'repos/interdomestik/interdomestik/pulls/17';

test('physical requests are reserved before concurrent fetches and never exceed sixty', async () => {
  const f = await fixture();
  const results = await Promise.allSettled(
    Array.from({ length: 65 }, () => f.client.response(endpoint))
  );
  assert.equal(f.calls(), 60);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 60);
  assert.equal(f.client.budget.reason, 'request-budget');
  await assert.rejects(f.client.response(endpoint), /feedback budget/u);
  assert.equal(f.calls(), 60);
});

for (const response of [
  {
    headers: { 'x-ratelimit-resource': 'core', 'x-ratelimit-remaining': '250' },
    reason: 'shared-quota',
  },
  {
    headers: { 'x-ratelimit-resource': 'graphql', 'x-ratelimit-remaining': '250' },
    reason: 'shared-quota',
  },
  { status: 429, reason: 'rate-limited' },
  { status: 403, headers: { 'retry-after': '60' }, reason: 'rate-limited' },
  { headers: {}, reason: 'quota-unknown' },
  {
    headers: { 'x-ratelimit-resource': 'core', 'x-ratelimit-remaining': 'invalid' },
    reason: 'quota-unknown',
  },
]) {
  test(`transport latches ${response.reason} and never retries or issues later requests`, async () => {
    const f = await fixture(response);
    await f.client.response(endpoint).catch(() => {});
    assert.equal(f.client.budget.reason, response.reason);
    await assert.rejects(f.client.response(endpoint, { method: 'POST' }), /feedback budget/u);
    assert.equal(f.calls(), 1);
  });
}

test('ordinary permission errors do not pretend the shared quota is exhausted', async () => {
  const f = await fixture({ status: 403 });
  await assert.rejects(f.client.response(endpoint), /403/u);
  assert.equal(f.client.budget.reason, '');
  assert.equal(f.calls(), 1);
});

test('transport failure is counted and is never retried inside the budget wrapper', async () => {
  let calls = 0;
  const client = createRefreshClient('fixture-token', async () => {
    calls++;
    throw new Error('uncertain transport');
  });
  await assert.rejects(client.response(endpoint, { method: 'POST' }), /uncertain transport/u);
  assert.equal(calls, 1);
  assert.equal(client.budget.requests, 1);
});

function transportFixture(floorAt = Infinity) {
  const f = controllerFixture();
  const calls = [];
  const client = createRefreshClient('fixture-token', async (url, options) => {
    calls.push({ path: url.pathname, method: options.method ?? 'GET' });
    const endpoint = url.pathname.slice(1);
    let payload;
    if (endpoint === 'graphql') {
      payload = { data: await f.client.graphql() };
    } else if (url.searchParams.has('page')) {
      const key = endpoint.endsWith('/runs')
        ? 'workflow_runs'
        : endpoint.endsWith('/jobs')
          ? 'jobs'
          : null;
      url.searchParams.delete('page');
      url.searchParams.delete('per_page');
      const path = endpoint + (url.search ? url.search : '');
      const { values } = await f.client.pages(path, key);
      payload = key ? { [key]: values } : values;
    } else if (options.method === 'POST') {
      await f.client.response(endpoint, options);
      payload = {};
    } else payload = await f.client.request(endpoint);
    return new Response(JSON.stringify(payload), {
      status: options.method === 'POST' && endpoint !== 'graphql' ? 201 : 200,
      headers: {
        'x-ratelimit-resource': endpoint === 'graphql' ? 'graphql' : 'core',
        'x-ratelimit-remaining': calls.length >= floorAt ? '250' : '900',
      },
    });
  });
  return { ...f, client, calls };
}

test('a changed-feedback lane revalidates and dispatches once within the physical budget', async () => {
  const f = transportFixture();
  const result = await refreshOne(f.client, 17, f.evidence.workflow, {
    now: f.evidence.now,
    apply: true,
  });
  assert.equal(result.status, 'refresh-requested');
  assert.equal(f.writes.length, 1);
  assert.ok(f.runReads() >= 3);
  assert.equal(f.calls.length, 33);
  assert.equal(f.client.budget.requests, f.calls.length);
});

test('quota boundaries abort partial proof without dispatch, but preserve an accepted POST', async () => {
  for (const floorAt of [1, 13, 26, 32, 33]) {
    const f = transportFixture(floorAt);
    const result = await refreshOne(f.client, 17, f.evidence.workflow, {
      now: f.evidence.now,
      apply: true,
    }).catch(error => {
      assert.match(error.message, /feedback budget/u);
      return null;
    });
    assert.equal(f.writes.length, floorAt === 33 ? 1 : 0);
    assert.equal(result?.status ?? null, floorAt === 33 ? 'refresh-requested' : null);
    assert.equal(f.client.budget.reason, 'shared-quota');
    assert.ok(f.calls.length <= floorAt + 2, 'only already-reserved concurrent reads may finish');
  }
});

test('budget exhaustion during inventory is explicit and cannot dispatch from a partial list', async () => {
  let calls = 0;
  const reports = [];
  const client = createRefreshClient('fixture-token', async () => {
    calls++;
    return new Response(
      JSON.stringify({
        data: {
          repository: {
            pullRequests: {
              nodes: [{ number: 17 }],
              pageInfo: { hasNextPage: true, endCursor: 'next' },
            },
          },
        },
      }),
      { headers: { 'x-ratelimit-resource': 'graphql', 'x-ratelimit-remaining': '250' } }
    );
  });
  assert.deepEqual(
    await refreshRepository(client, { apply: true, report: item => reports.push(item) }),
    { failed: 0, deferred: 1 }
  );
  assert.equal(calls, 1);
  assert.deepEqual(reports, [
    { status: 'deferred-budget', reason: 'shared-quota', scope: 'inventory' },
  ]);
});

test('the production entrypoint uses the bounded client for schedule and manual dispatch alike', () => {
  const source = readFileSync(new URL('./pr-feedback-controller.mjs', import.meta.url), 'utf8');
  assert.match(source, /const client = createRefreshClient\(process\.env\.GITHUB_TOKEN\)/u);
  assert.doesNotMatch(source, /new GitHubClient/u);
});
