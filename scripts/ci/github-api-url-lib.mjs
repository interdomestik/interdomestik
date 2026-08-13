const DEFAULT_API_BASE_URL = 'https://api.github.com';

function createGitHubApiUrl() {
  const url = new URL(DEFAULT_API_BASE_URL);
  url.search = '';
  url.hash = '';
  return url;
}

function apiPathPrefix(url) {
  return url.pathname === '/' ? '' : url.pathname;
}

function parseRepositoryFullName(repositoryFullName) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u.exec(
    String(repositoryFullName || '').trim()
  );
  if (!match) {
    throw new TypeError('repositoryFullName must be an owner/repo slug');
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

function relativePath(value, label) {
  const raw = String(value || '');
  const segments = raw.split('/').filter(Boolean);

  if (
    raw.startsWith('/') ||
    segments.length === 0 ||
    segments.some(segment => segment === '.' || segment === '..' || /[?#\\]/u.test(segment))
  ) {
    throw new TypeError(`${label} must be a repository-relative path`);
  }

  return segments.join('/');
}

function encodePath(filePath) {
  return relativePath(filePath, 'filePath')
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
}

function commitSha(value) {
  const sha = String(value || '').trim();
  if (!/^[0-9a-f]{40}$/u.test(sha)) {
    throw new TypeError('commitSha must be a full commit SHA');
  }
  return sha;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function setPagination(url, { page, perPage }) {
  positiveInteger(page, 'page');
  positiveInteger(perPage, 'perPage');
  if (perPage > 100) throw new TypeError('perPage must not exceed 100');
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
}

export function buildPullRequestFilesUrl({ repositoryFullName, pullRequestNumber, page, perPage }) {
  const url = createGitHubApiUrl();
  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  url.pathname = `${apiPathPrefix(url)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/pulls/${pullRequestNumber}/files`;
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
  return url.toString();
}

export function buildRepositoryFileContentUrl({ repositoryFullName, filePath, ref }) {
  const url = createGitHubApiUrl();
  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  url.pathname = `${apiPathPrefix(url)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/contents/${encodePath(filePath)}`;
  url.searchParams.set('ref', String(ref));
  return url.toString();
}

export function buildCommitPullRequestsUrl({ repositoryFullName, commitSha: sha, page, perPage }) {
  const url = createGitHubApiUrl();
  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  url.pathname = `${apiPathPrefix(url)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/commits/${commitSha(sha)}/pulls`;
  setPagination(url, { page, perPage });
  return url.toString();
}

export function buildCommitUrl({ repositoryFullName, commitSha: sha }) {
  const url = createGitHubApiUrl();
  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  url.pathname = `${apiPathPrefix(url)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/commits/${commitSha(sha)}`;
  return url.toString();
}

export function buildWorkflowRunsUrl({ repositoryFullName, workflowPath, headSha, page, perPage }) {
  const url = createGitHubApiUrl();
  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  const workflow = encodeURIComponent(relativePath(workflowPath, 'workflowPath'));
  url.pathname = `${apiPathPrefix(url)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/actions/workflows/${workflow}/runs`;
  url.searchParams.set('event', 'pull_request');
  url.searchParams.set('status', 'completed');
  url.searchParams.set('head_sha', commitSha(headSha));
  setPagination(url, { page, perPage });
  return url.toString();
}

export function buildRunJobsUrl({ repositoryFullName, runId, page, perPage }) {
  const url = createGitHubApiUrl();
  const { owner, repo } = parseRepositoryFullName(repositoryFullName);
  url.pathname = `${apiPathPrefix(url)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
    repo
  )}/actions/runs/${positiveInteger(runId, 'runId')}/jobs`;
  setPagination(url, { page, perPage });
  return url.toString();
}
