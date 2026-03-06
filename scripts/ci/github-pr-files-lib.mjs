import fs from 'node:fs';

const DEFAULT_API_BASE_URL = 'https://api.github.com';
const PER_PAGE = 100;

function parseRepositoryFullName(value) {
  const normalized = String(value || '').trim();
  if (!normalized || !normalized.includes('/')) {
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
    throw new Error('repository full name is required for pull request file discovery');
  }

  return {
    pullRequestNumber,
    repositoryFullName: resolvedRepositoryFullName,
  };
}

export async function fetchPullRequestFiles({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  repositoryFullName,
  pullRequestNumber,
  token,
  fetchImpl = globalThis.fetch,
}) {
  if (!repositoryFullName) {
    throw new Error('repositoryFullName is required');
  }

  if (!Number.isInteger(pullRequestNumber)) {
    throw new Error('pullRequestNumber must be an integer');
  }

  if (!token) {
    throw new Error('GH_TOKEN or GITHUB_TOKEN is required');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required');
  }

  const files = [];
  let nextPage = 1;

  while (nextPage !== null) {
    const response = await fetchImpl(
      `${apiBaseUrl}/repos/${repositoryFullName}/pulls/${pullRequestNumber}/files?per_page=${PER_PAGE}&page=${nextPage}`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'user-agent': 'interdomestik-ci',
        },
      }
    );

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `failed to fetch pull request files (${response.status} ${response.statusText}): ${responseBody}`
      );
    }

    const page = await response.json();
    files.push(...page.map(file => String(file?.filename || '').trim()).filter(Boolean));

    nextPage = page.length === PER_PAGE ? nextPage + 1 : null;
  }

  return files;
}
