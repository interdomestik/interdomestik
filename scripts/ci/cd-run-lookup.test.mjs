import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNoCompetingRuns,
  createLookupBudget,
  fetchCurrentRun,
  fetchNonterminalRuns,
  fetchRunPage,
} from './cd-nondeploy-guard.mjs';

const sha = character => character.repeat(40);
const runsPath = '/repos/interdomestik/interdomestik/actions/workflows/cd.yml/runs';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 3, 18, 0, 0);
const runResponse = (runs, total = runs.length) => ({
  ok: true,
  json: async () => ({ total_count: total, workflow_runs: runs }),
});
const currentResponse = run => ({ ok: true, json: async () => run });
const httpFailure = (status, headers = {}) => ({
  ok: false,
  status,
  headers: new Headers(headers),
});
const completedRuns = (count, firstId) =>
  Array.from({ length: count }, (_, index) => ({
    id: firstId + index,
    run_attempt: 1,
    status: 'completed',
  }));
function fakeBudget({ now = () => NOW } = {}) {
  const sleeps = [];
  const budget = createLookupBudget({ now, sleep: async ms => sleeps.push(ms), random: () => 0 });
  return { budget, sleeps };
}

test('direct current lookup pins the run ID and validates its response', async () => {
  const requests = [];
  const current = { id: 41, run_attempt: 3, head_sha: sha('a'), status: 'in_progress' };
  const result = await fetchCurrentRun({
    token: 'test-token',
    runId: 41,
    budget: fakeBudget().budget,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return currentResponse(current);
    },
  });
  assert.deepEqual(result, current);
  assert.equal(requests[0].url.pathname, '/repos/interdomestik/interdomestik/actions/runs/41');
  assert.equal(requests[0].options.redirect, 'error');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});
test('run-page lookup pins its target, creation window and page size', async () => {
  const requests = [];
  const page = await fetchRunPage({
    token: 'test-token',
    page: 2,
    createdSince: '2026-08-29T18:00:00.000Z',
    budget: fakeBudget().budget,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return runResponse([{ id: 42, run_attempt: 1 }], 101);
    },
  });
  assert.deepEqual(page, { runs: [{ id: 42, run_attempt: 1 }], totalCount: 101 });
  assert.equal(requests[0].url.origin, 'https://api.github.com');
  assert.equal(requests[0].url.pathname, runsPath);
  assert.equal(requests[0].url.searchParams.has('status'), false);
  assert.equal(requests[0].url.searchParams.get('created'), '>=2026-08-29T18:00:00.000Z');
  assert.equal(requests[0].url.searchParams.get('per_page'), '100');
  assert.equal(requests[0].url.searchParams.get('page'), '2');
  assert.equal(requests[0].options.redirect, 'error');
  await assert.rejects(
    () =>
      fetchRunPage({
        token: 'test-token',
        page: 1,
        createdSince: 'x',
        budget: fakeBudget().budget,
        fetchImpl: async () => ({ ok: true, json: async () => ({ workflow_runs: [] }) }),
      }),
    /response is invalid/u
  );
});
test('window pages retain current identity, reject a later-page competitor, freeze the cutoff', async () => {
  const requests = [];
  let clock = NOW;
  const current = { id: 41, run_attempt: 3, head_sha: sha('a'), status: 'in_progress' };
  const competitor = { ...current, id: 40, status: 'queued' };
  const runs = await fetchNonterminalRuns({
    token: 'test-token',
    budget: fakeBudget({ now: () => clock }).budget,
    fetchImpl: async url => {
      const request = new URL(url);
      requests.push(request);
      clock += 30_000;
      return request.searchParams.get('page') === '1'
        ? runResponse(completedRuns(100, 100), 102)
        : runResponse([current, competitor], 102);
    },
  });
  assert.deepEqual(runs, [current, competitor]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(url => !url.searchParams.has('status')));
  const cutoff = new Date(NOW - 66 * DAY_MS).toISOString();
  assert.ok(requests.every(url => url.searchParams.get('created') === `>=${cutoff}`));
  assert.throws(
    () =>
      assertNoCompetingRuns({ runs, currentRun: current, runId: 41, runAttempt: 3, sha: sha('a') }),
    /competing nonterminal run/u
  );
});
test('unknown run states remain blocking and missing status fails closed', async () => {
  const unknown = await fetchNonterminalRuns({
    token: 'test-token',
    budget: fakeBudget().budget,
    fetchImpl: async () => runResponse([{ id: 42, run_attempt: 1, status: 'approval_hold' }]),
  });
  assert.equal(unknown.length, 1);
  await assert.rejects(
    () =>
      fetchNonterminalRuns({
        token: 'test-token',
        budget: fakeBudget().budget,
        fetchImpl: async () => runResponse([{ id: 42, run_attempt: 1 }]),
      }),
    /invalid status/u
  );
});
test('a window at the filtered result cap, overrun pages or a short listing fail closed', async () => {
  const lookup = fetchImpl =>
    fetchNonterminalRuns({ token: 'test-token', budget: fakeBudget().budget, fetchImpl });
  await assert.rejects(
    () => lookup(async () => runResponse(completedRuns(100, 1), 1000)),
    /result cap/u
  );
  let requests = 0;
  await assert.rejects(
    () =>
      lookup(async () => {
        requests += 1;
        return runResponse(completedRuns(100, requests * 100), 999);
      }),
    /pagination exceeded/u
  );
  assert.equal(requests, 10);
  await assert.rejects(
    () =>
      lookup(async url =>
        new URL(url).searchParams.get('page') === '1'
          ? runResponse(completedRuns(100, 1), 150)
          : runResponse(completedRuns(20, 101), 150)
      ),
    /fewer runs than it reported/u
  );
});
test('a run arriving between pages fails closed instead of hiding behind a repeated entry', async () => {
  const page1 = completedRuns(100, 1);
  // A queued competitor shifts the listing: page 2 repeats page 1's last entry and reports one
  // more run, so unique ids still match page 1's total while the competitor is never seen.
  const page2 = [page1[99], ...completedRuns(49, 101)];
  await assert.rejects(
    () =>
      fetchNonterminalRuns({
        token: 'test-token',
        budget: fakeBudget().budget,
        fetchImpl: async url =>
          new URL(url).searchParams.get('page') === '1'
            ? runResponse(page1, 150)
            : runResponse(page2, 151),
      }),
    /changed while paging/u
  );
});
test('transient failures retry with backoff and recover within three attempts', async () => {
  const { budget, sleeps } = fakeBudget();
  const responses = [
    httpFailure(502),
    Promise.reject(new TypeError('fetch failed')),
    runResponse([]),
  ];
  let calls = 0;
  const runs = await fetchNonterminalRuns({
    token: 'test-token',
    budget,
    fetchImpl: async () => responses[calls++],
  });
  assert.deepEqual(runs, []);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [1000, 2000]);
});
test('retry exhaustion and permanent errors fail closed without an empty result', async () => {
  const exhausted = fakeBudget();
  let calls = 0;
  await assert.rejects(
    () =>
      fetchNonterminalRuns({
        token: 'test-token',
        budget: exhausted.budget,
        fetchImpl: async () => {
          calls += 1;
          return httpFailure(503);
        },
      }),
    /GitHub run lookup failed with HTTP 503/u
  );
  assert.equal(calls, 3);
  for (const status of [401, 403, 404]) {
    const permanent = fakeBudget();
    let attempts = 0;
    await assert.rejects(
      () =>
        fetchCurrentRun({
          token: 'test-token',
          runId: 41,
          budget: permanent.budget,
          fetchImpl: async () => {
            attempts += 1;
            return httpFailure(status);
          },
        }),
      new RegExp(`current run lookup failed with HTTP ${status}`, 'u')
    );
    assert.equal(attempts, 1);
    assert.deepEqual(permanent.sleeps, []);
  }
});
test('rate-limit responses fail closed without retrying', async () => {
  const limits = [
    httpFailure(429, { 'retry-after': '2' }),
    httpFailure(403, { 'x-ratelimit-remaining': '0' }),
  ];
  for (const response of limits) {
    const { budget, sleeps } = fakeBudget();
    let calls = 0;
    await assert.rejects(
      () =>
        fetchCurrentRun({
          token: 'test-token',
          runId: 41,
          budget,
          fetchImpl: async () => {
            calls += 1;
            return response;
          },
        }),
      new RegExp(`HTTP ${response.status}`, 'u')
    );
    assert.equal(calls, 1);
    assert.deepEqual(sleeps, []);
  }
});
test('a spent lookup budget fails before issuing another request', async () => {
  let clock = NOW;
  const { budget } = fakeBudget({ now: () => clock });
  clock += 9 * 60 * 1000;
  let calls = 0;
  await assert.rejects(
    () =>
      fetchCurrentRun({
        token: 'test-token',
        runId: 41,
        budget,
        fetchImpl: async () => {
          calls += 1;
          return currentResponse({ id: 41 });
        },
      }),
    /exceeded its time budget/u
  );
  assert.equal(calls, 0);
});
