import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNoCompetingRuns,
  fetchCurrentRun,
  fetchNonterminalRuns,
  fetchRunPage,
} from './cd-nondeploy-guard.mjs';

const sha = character => character.repeat(40);
const runsPath = '/repos/interdomestik/interdomestik/actions/workflows/cd.yml/runs';
const runResponse = runs => ({ ok: true, json: async () => ({ workflow_runs: runs }) });
const currentResponse = run => ({ ok: true, json: async () => run });

test('direct current lookup pins the run ID and validates its response', async () => {
  const requests = [];
  const current = { id: 41, run_attempt: 3, head_sha: sha('a'), status: 'in_progress' };
  const result = await fetchCurrentRun({
    token: 'test-token',
    runId: 41,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return currentResponse(current);
    },
  });
  assert.deepEqual(result, current);
  assert.equal(requests[0].url.pathname, '/repos/interdomestik/interdomestik/actions/runs/41');
  assert.equal(requests[0].options.redirect, 'error');
});
test('run-page lookup pins its target and validates response shape', async () => {
  const requests = [];
  const runs = await fetchRunPage({
    token: 'test-token',
    page: 2,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return runResponse([{ id: 42, run_attempt: 1 }]);
    },
  });
  assert.deepEqual(runs, [{ id: 42, run_attempt: 1 }]);
  assert.equal(requests[0].url.origin, 'https://api.github.com');
  assert.equal(requests[0].url.pathname, runsPath);
  assert.equal(requests[0].url.searchParams.has('status'), false);
  assert.equal(requests[0].url.searchParams.get('page'), '2');
  assert.equal(requests[0].options.redirect, 'error');
});
test('unfiltered run pages retain current identity and reject a later-page competitor', async () => {
  const requests = [];
  const completed = Array.from({ length: 100 }, (_, index) => ({
    id: index + 100,
    run_attempt: 1,
    status: 'completed',
  }));
  const current = { id: 41, run_attempt: 3, head_sha: sha('a'), status: 'in_progress' };
  const competitor = { ...current, id: 40, status: 'queued' };
  const runs = await fetchNonterminalRuns({
    token: 'test-token',
    fetchImpl: async url => {
      const request = new URL(url);
      requests.push(request);
      return runResponse(
        request.searchParams.get('page') === '1' ? completed : [current, competitor]
      );
    },
  });
  assert.deepEqual(runs, [current, competitor]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(url => !url.searchParams.has('status')));
  assert.throws(
    () =>
      assertNoCompetingRuns({ runs, currentRun: current, runId: 41, runAttempt: 3, sha: sha('a') }),
    /competing nonterminal run/u
  );
});
test('unknown run states remain blocking and missing status fails closed', async () => {
  const unknown = await fetchNonterminalRuns({
    token: 'test-token',
    fetchImpl: async () => runResponse([{ id: 42, run_attempt: 1, status: 'approval_hold' }]),
  });
  assert.equal(unknown.length, 1);
  await assert.rejects(
    () =>
      fetchNonterminalRuns({
        token: 'test-token',
        fetchImpl: async () => runResponse([{ id: 42, run_attempt: 1 }]),
      }),
    /invalid status/u
  );
});
test('run lookup fails closed if complete history exceeds the bounded page limit', async () => {
  let requests = 0;
  await assert.rejects(
    () =>
      fetchNonterminalRuns({
        token: 'test-token',
        fetchImpl: async () => {
          requests += 1;
          return runResponse(Array.from({ length: 100 }, () => ({ status: 'completed' })));
        },
      }),
    /pagination exceeded/u
  );
  assert.equal(requests, 100);
});
