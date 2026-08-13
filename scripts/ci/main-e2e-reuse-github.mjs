import { execFileSync } from 'node:child_process';
import {
  buildCommitPullRequestsUrl,
  buildCommitUrl,
  buildRunJobsUrl,
  buildWorkflowRunsUrl,
} from './github-api-url-lib.mjs';

const WORKFLOW_PATH = '.github/workflows/e2e-pr.yml';

export function readLocalGitObjectId(cwd, revision) {
  return execFileSync('/usr/bin/git', ['rev-parse', revision], {
    cwd,
    encoding: 'utf8',
    env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' },
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

async function requestJson({ url, token, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error('request rejected');
    return await response.json();
  } catch {
    throw new Error('GitHub API request failed');
  } finally {
    clearTimeout(timeout);
  }
}

async function collectArrayPages({ buildUrl, request, perPage, maxPages }) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await request(buildUrl(page, perPage));
    if (!Array.isArray(payload)) throw new Error('GitHub API schema invalid');
    items.push(...payload);
    if (payload.length < perPage) return items;
  }
  throw new Error('GitHub API pagination incomplete');
}

async function collectWrappedPages({ buildUrl, key, request, perPage, maxPages }) {
  const items = [];
  let totalCount;
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await request(buildUrl(page, perPage));
    if (
      !payload ||
      !Number.isSafeInteger(payload.total_count) ||
      payload.total_count < 0 ||
      !Array.isArray(payload[key])
    ) {
      throw new Error('GitHub API schema invalid');
    }
    if (totalCount === undefined) totalCount = payload.total_count;
    if (payload.total_count !== totalCount || items.length + payload[key].length > totalCount) {
      throw new Error('GitHub API schema invalid');
    }
    items.push(...payload[key]);
    if (items.length === totalCount) return items;
    if (payload[key].length === 0) break;
  }
  throw new Error('GitHub API pagination incomplete');
}

export async function collectGitHubEvidence({
  repositoryFullName,
  githubSha,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
  perPage = 100,
  maxPages = 3,
  maxRuns = 20,
}) {
  if (typeof token !== 'string' || token.length === 0 || typeof fetchImpl !== 'function') {
    throw new Error('GitHub evidence selection failed');
  }
  const request = url => requestJson({ url, token, fetchImpl, timeoutMs });
  const commitPulls = sha =>
    collectArrayPages({
      buildUrl: (page, size) =>
        buildCommitPullRequestsUrl({
          repositoryFullName,
          commitSha: sha,
          page,
          perPage: size,
        }),
      request,
      perPage,
      maxPages,
    });
  const pullRequests = await commitPulls(githubSha);
  if (pullRequests.length !== 1 || typeof pullRequests[0]?.head?.sha !== 'string') {
    throw new Error('GitHub evidence selection failed');
  }
  const headSha = pullRequests[0].head.sha;
  const headCommit = await request(buildCommitUrl({ repositoryFullName, commitSha: headSha }));
  const runs = await collectWrappedPages({
    buildUrl: (page, size) =>
      buildWorkflowRunsUrl({
        repositoryFullName,
        workflowPath: WORKFLOW_PATH,
        headSha,
        page,
        perPage: Math.min(size, 20),
      }),
    key: 'workflow_runs',
    request,
    perPage: Math.min(perPage, 20),
    maxPages,
  });
  if (runs.length > maxRuns) throw new Error('GitHub evidence selection failed');

  const candidates = [];
  for (const run of runs) {
    const jobs = await collectWrappedPages({
      buildUrl: (page, size) =>
        buildRunJobsUrl({ repositoryFullName, runId: run?.id, page, perPage: size }),
      key: 'jobs',
      request,
      perPage,
      maxPages,
    });
    const candidate = { run, jobs };
    if (Array.isArray(run?.pull_requests) && run.pull_requests.length === 0) {
      candidate.fallbackPullRequests = await commitPulls(run.head_sha);
    }
    candidates.push(candidate);
  }

  return { pullRequests, headCommit, candidates };
}
