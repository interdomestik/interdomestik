import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DELIVERY_POLL_MS = 30_000;
const DELIVERY_QUIESCENCE_MS = 20_000;
const MAX_PAGES = 100;
const MAX_DELIVERY_DELAY_MS = 60 * 60 * 1000;
const GITHUB_API_ORIGIN = 'https://api.github.com';
const SAFE_ENDPOINT = /^[a-z0-9._~!$&'()*+,;=:@/?-]+$/iu;

function apiFail(message, waiting = false, retryAfterMs = DELIVERY_POLL_MS) {
  const error = new Error(`${waiting ? 'WAIT: ' : ''}${message}`);
  if (waiting) error.retryAfterMs = retryAfterMs;
  throw error;
}

export function waitForDelivery(milliseconds, timer = setTimeout) {
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > MAX_DELIVERY_DELAY_MS
  ) {
    apiFail('delivery delay escaped the bounded timer contract');
  }
  return (async () => {
    if (milliseconds === DELIVERY_QUIESCENCE_MS) {
      await new Promise(resolve => timer(resolve, DELIVERY_QUIESCENCE_MS));
      return;
    }
    for (let elapsed = 0; elapsed < milliseconds; elapsed += DELIVERY_POLL_MS) {
      await new Promise(resolve => timer(resolve, DELIVERY_POLL_MS));
    }
  })();
}

export function trustedGitHubApiUrl(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 500 || !SAFE_ENDPOINT.test(endpoint)) {
    apiFail('GitHub API endpoint contains unsafe characters');
  }
  const url = new URL(endpoint, `${GITHUB_API_ORIGIN}/`);
  const trustedPath =
    url.pathname === '/graphql' || url.pathname.startsWith('/repos/interdomestik/interdomestik/');
  const trustedQuery = [...url.searchParams].every(([key, value]) => {
    if (!['filter', 'page', 'per_page', 'ref'].includes(key)) return false;
    if (key === 'filter') return value === 'all';
    if (key === 'ref') return /^[a-f0-9]{40}$/u.test(value);
    return /^[1-9]\d*$/u.test(value);
  });
  const boundaryViolated =
    url.origin !== GITHUB_API_ORIGIN ||
    !trustedPath ||
    url.username ||
    url.password ||
    url.hash ||
    !trustedQuery;
  if (boundaryViolated) apiFail('GitHub API endpoint escaped the trusted boundary');
  return url;
}

function responseHeader(response, name) {
  return response.headers?.get?.(name) ?? '';
}

function retryDelay(response) {
  const retryAfter = Number(responseHeader(response, 'retry-after')) * 1000;
  const resetAt = Number(responseHeader(response, 'x-ratelimit-reset')) * 1000;
  const resetDelay =
    Number.isFinite(resetAt) && resetAt > Date.now() ? resetAt - Date.now() + 1000 : 0;
  return Math.min(MAX_DELIVERY_DELAY_MS, Math.max(DELIVERY_POLL_MS, retryAfter || 0, resetDelay));
}

export class GitHubClient {
  constructor(repository, token, fetchImpl = fetch) {
    this.repository = repository;
    this.token = token;
    this.fetch = fetchImpl;
    this.jobCache = new Map();
    this.immutableCache = new Map();
  }

  async response(endpoint, options = {}) {
    const url = trustedGitHubApiUrl(endpoint);
    const response = await this.fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        ...options.headers,
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }); // NOSONAR -- trustedGitHubApiUrl enforces the exact origin, path and query-key boundary.
    if (!response.ok) {
      const exhausted = responseHeader(response, 'x-ratelimit-remaining') === '0';
      const askedToRetry = Boolean(responseHeader(response, 'retry-after'));
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 403 && (exhausted || askedToRetry));
      apiFail(
        `GitHub API ${endpoint} returned ${response.status}`,
        retryable,
        retryDelay(response)
      );
    }
    return response;
  }

  async request(endpoint, options = {}) {
    return (await this.response(endpoint, options)).json();
  }

  async pages(endpoint, key = null) {
    const values = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const separator = endpoint.includes('?') ? '&' : '?';
      const response = await this.response(`${endpoint}${separator}per_page=100&page=${page}`);
      const payload = await response.json();
      const batch = key ? payload[key] : payload;
      if (!Array.isArray(batch)) apiFail(`GitHub pagination mismatch for ${endpoint}`);
      values.push(...batch);
      if (!/rel="next"/u.test(responseHeader(response, 'link'))) {
        return { values, complete: true };
      }
    }
    return { values, complete: false };
  }

  async graphql(query, variables) {
    const payload = await this.request('graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (payload.errors?.length) apiFail(`GitHub GraphQL error: ${payload.errors[0].message}`);
    return payload.data;
  }

  async runIdentity(check) {
    if (check.app.id !== 15368) return { runId: check.id, runAttempt: 1 };
    if (this.jobCache.has(check.id)) return this.jobCache.get(check.id);
    const jobId = /\/job\/(\d+)/u.exec(check.details_url ?? '')?.[1];
    if (!jobId) apiFail(`GitHub Actions job identity missing for ${check.name}`);
    const job = await this.request(`repos/${this.repository}/actions/jobs/${jobId}`);
    const identity = { runId: job.run_id, runAttempt: job.run_attempt };
    this.jobCache.set(check.id, identity);
    return identity;
  }

  async cached(key, loader) {
    if (!this.immutableCache.has(key)) this.immutableCache.set(key, await loader());
    return this.immutableCache.get(key);
  }
}

export function isDirectInvocation(moduleUrl) {
  if (!process.argv[1]) return false;
  return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(moduleUrl));
}
