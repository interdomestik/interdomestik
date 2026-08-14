import assert from 'node:assert/strict';
import test from 'node:test';

import { collectGitHubEvidence } from './main-e2e-reuse-github.mjs';
import {
  HEAD_SHA,
  MAIN_SHA,
  REPOSITORY,
  directAssociation,
  reusablePullRequest,
  reusableRun,
} from './main-e2e-reuse-fixture.mjs';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function githubApi({
  mainPulls = [reusablePullRequest()],
  fallbackPulls = [reusablePullRequest()],
  run = reusableRun(),
  runsPayload,
  jobsPayload,
} = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes(`/commits/${MAIN_SHA}/pulls`)) return jsonResponse(mainPulls);
    if (String(url).includes(`/commits/${HEAD_SHA}/pulls`)) return jsonResponse(fallbackPulls);
    if (String(url).includes(`/commits/${HEAD_SHA}`)) {
      return jsonResponse({ sha: HEAD_SHA, commit: { tree: { sha: 'c'.repeat(40) } } });
    }
    if (String(url).includes('/actions/workflows/')) {
      return jsonResponse(runsPayload ?? { total_count: 1, workflow_runs: [run] });
    }
    if (String(url).includes('/actions/runs/')) {
      return jsonResponse(
        jobsPayload ?? {
          total_count: 1,
          jobs: [
            {
              id: 94_487_829_021,
              name: 'PR E2E Runner',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        }
      );
    }
    throw new Error(`unexpected test URL: ${url}`);
  };
  return { fetchImpl, requests };
}

function collect(api, overrides = {}) {
  return collectGitHubEvidence({
    repositoryFullName: REPOSITORY,
    githubSha: MAIN_SHA,
    token: 'test-token',
    fetchImpl: api.fetchImpl,
    timeoutMs: 100,
    ...overrides,
  });
}

test('collects bounded PR, tree, run, job, and empty-association fallback evidence', async () => {
  const api = githubApi();
  const evidence = await collect(api);

  assert.equal(evidence.pullRequests.length, 1);
  assert.equal(evidence.headCommit.sha, HEAD_SHA);
  assert.equal(evidence.candidates.length, 1);
  assert.equal(evidence.candidates[0].fallbackPullRequests[0].number, 1548);
  assert.equal(api.requests.length, 5);
  for (const request of api.requests) {
    assert.equal(request.options.headers.Authorization, 'Bearer test-token');
    assert.ok(request.options.signal instanceof AbortSignal);
  }
});

test('never queries fallback after a non-empty direct association, even when it mismatches', async () => {
  const mismatch = { ...directAssociation(), number: 9999 };
  const api = githubApi({ run: reusableRun({ pullRequests: [mismatch] }) });
  const evidence = await collect(api);

  assert.equal(evidence.candidates[0].fallbackPullRequests, undefined);
  assert.equal(
    api.requests.some(request => request.url.includes(`/commits/${HEAD_SHA}/pulls`)),
    false
  );
});

test('fails closed on ambiguous merged pull request selection', async () => {
  const pr = reusablePullRequest();
  const api = githubApi({ mainPulls: [pr, structuredClone(pr)] });
  await assert.rejects(() => collect(api), /GitHub evidence selection failed/u);
});

test('fails closed when bounded pagination cannot prove completion', async () => {
  const api = githubApi();
  await assert.rejects(
    () => collect(api, { perPage: 1, maxPages: 1 }),
    /GitHub API pagination incomplete/u
  );
});

test('fails closed on malformed response schemas', async () => {
  const api = githubApi({ mainPulls: { pull_requests: [reusablePullRequest()] } });
  await assert.rejects(() => collect(api), /GitHub API schema invalid/u);

  const wrapped = githubApi({ runsPayload: { total_count: 2, workflow_runs: [] } });
  await assert.rejects(() => collect(wrapped), /GitHub API pagination incomplete/u);
});

test('bounds requests by timeout', async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  await assert.rejects(
    () =>
      collectGitHubEvidence({
        repositoryFullName: REPOSITORY,
        githubSha: MAIN_SHA,
        token: 'test-token',
        fetchImpl,
        timeoutMs: 5,
      }),
    /GitHub API request failed/u
  );
});

test('API failures expose neither tokens nor response bodies', async () => {
  const fetchImpl = async () => new Response('TOP-SECRET-BODY', { status: 500 });
  const error = await collectGitHubEvidence({
    repositoryFullName: REPOSITORY,
    githubSha: MAIN_SHA,
    token: 'TOP-SECRET-TOKEN',
    fetchImpl,
  }).catch(value => value);

  assert.match(error.message, /GitHub API request failed/u);
  assert.doesNotMatch(error.message, /TOP-SECRET/u);
});
