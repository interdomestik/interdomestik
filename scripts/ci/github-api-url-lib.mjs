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

function encodePath(filePath) {
  const segments = String(filePath || '')
    .split('/')
    .filter(Boolean);

  if (
    segments.length === 0 ||
    segments.some(segment => segment === '.' || segment === '..' || /[?#\\]/u.test(segment))
  ) {
    throw new TypeError('filePath must be a repository-relative path');
  }

  return segments.map(segment => encodeURIComponent(segment)).join('/');
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
