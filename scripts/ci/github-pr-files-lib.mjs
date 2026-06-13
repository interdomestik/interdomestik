import fs from 'node:fs';

import { buildPullRequestFilesUrl, buildRepositoryFileContentUrl } from './github-api-url-lib.mjs';

const PER_PAGE = 100;

function parseRepositoryFullName(value) {
  const normalized = value?.toString()?.trim();
  if (!normalized?.includes('/')) {
    return null;
  }

  return normalized;
}

export function readPullRequestContext(eventPath, repositoryFullName = '') {
  if (!eventPath || !fs.existsSync(eventPath)) {
    return null;
  }

  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const pullRequestNumber = event.pull_request?.number;

  if (!Number.isInteger(pullRequestNumber)) {
    return null;
  }

  const resolvedRepositoryFullName =
    parseRepositoryFullName(repositoryFullName) ||
    parseRepositoryFullName(event.repository?.full_name);

  if (!resolvedRepositoryFullName) {
    throw new TypeError('repository full name is required for pull request file discovery');
  }

  return {
    pullRequestNumber,
    repositoryFullName: resolvedRepositoryFullName,
  };
}

export async function fetchPullRequestFiles({
  repositoryFullName,
  pullRequestNumber,
  token,
  fetchImpl = globalThis.fetch,
}) {
  if (!repositoryFullName) {
    throw new TypeError('repositoryFullName is required');
  }
  if (!Number.isInteger(pullRequestNumber)) {
    throw new TypeError('pullRequestNumber must be an integer');
  }
  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch implementation is required');
  }
  const files = [];
  for (let nextPage = 1; ; nextPage += 1) {
    const requestUrl = buildPullRequestFilesUrl({
      repositoryFullName,
      pullRequestNumber,
      page: nextPage,
      perPage: PER_PAGE,
    });
    const response = await fetchImpl(requestUrl, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'interdomestik-ci',
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `failed to fetch pull request files (${response.status} ${response.statusText}): ${responseBody}`
      );
    }

    const page = await response.json();
    files.push(...page.map(file => String(file?.filename || '').trim()).filter(Boolean));

    if (page.length < PER_PAGE) {
      break;
    }
  }

  return files;
}

export async function fetchRepositoryFileContent({
  repositoryFullName,
  filePath,
  ref,
  token,
  fetchImpl = globalThis.fetch,
}) {
  if (!repositoryFullName) {
    throw new TypeError('repositoryFullName is required');
  }
  if (!filePath) {
    throw new TypeError('filePath is required');
  }
  if (!ref) {
    throw new TypeError('ref is required');
  }
  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch implementation is required');
  }
  const requestUrl = buildRepositoryFileContentUrl({
    repositoryFullName,
    filePath,
    ref,
  });
  const response = await fetchImpl(requestUrl, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'interdomestik-ci',
    },
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `failed to fetch repository file (${response.status} ${response.statusText}): ${responseBody}`
    );
  }

  const payload = await response.json();

  if (payload?.encoding !== 'base64' || typeof payload?.content !== 'string') {
    throw new Error('repository file response missing base64 content');
  }

  return Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
}
