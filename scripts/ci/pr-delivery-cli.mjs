import { execFileSync } from 'node:child_process';
import { GitHubClient, githubCliBinary, trustedGitHubApiUrl } from './pr-delivery-api.mjs';

function apiFail(message) {
  throw new Error(message);
}

function runGhApi(args, input) {
  const binary = githubCliBinary();
  try {
    return execFileSync(binary, args, {
      input,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 8 * 1024 ** 2,
    });
  } catch (error) {
    if (
      error.status === 1 &&
      !error.signal &&
      typeof error.stdout === 'string' &&
      /^HTTP\/[\d.]+ [45]\d{2}(?: |$)/u.test(error.stdout)
    )
      return error.stdout;
    throw error;
  }
}

export function githubCliResponse(endpoint, options = {}, invoke = runGhApi) {
  const url = trustedGitHubApiUrl(String(endpoint));
  const method = options.method ?? 'GET';
  if (method !== 'GET' && !(method === 'POST' && url.pathname === '/graphql'))
    apiFail('Unsupported CLI API method');
  if (
    (method === 'GET' && options.body !== undefined) ||
    (method === 'POST' && typeof options.body !== 'string')
  )
    apiFail('CLI API body mismatch');
  const args = [
    'api',
    '--hostname',
    'github.com',
    '--include',
    '--method',
    method,
    '-H',
    'Accept: application/vnd.github+json',
    '-H',
    'X-GitHub-Api-Version: 2022-11-28',
    url.pathname.slice(1) + url.search,
  ];
  if (method === 'POST') args.push('--input', '-');
  const raw = invoke(args, options.body);
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 8 * 1024 ** 2)
    apiFail('CLI API response exceeded bounds');
  const separator = raw.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const split = raw.indexOf(separator);
  if (split < 0) apiFail('CLI API response headers missing');
  const lines = raw.slice(0, split).split(/\r?\n/u);
  const status = Number(/^HTTP\/[\d.]+ (\d{3})(?: |$)/u.exec(lines.shift())?.[1]);
  if (!Number.isInteger(status) || status < 200 || status > 599)
    apiFail('CLI API response status invalid');
  const headers = new Headers();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) apiFail('CLI API response header invalid');
    headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
  }
  const body = [204, 205, 304].includes(status) ? null : raw.slice(split + separator.length);
  return new Response(body, { status, headers });
}

export class GitHubCliClient extends GitHubClient {
  constructor(repository, invoke = runGhApi) {
    super(repository, '', (url, options) => githubCliResponse(url, options, invoke));
  }
}
