import { GitHubClient } from './pr-delivery-api.mjs';

// At the five-minute cadence, at most 720 physical requests/hour, including GraphQL.
// The shared-quota floor also protects other workflows and repeated manual dispatches.
const REQUEST_LIMIT = 60;
const SHARED_QUOTA_FLOOR = 250;

export function createRefreshClient(token, fetchImpl = fetch) {
  const budget = { requests: 0, reason: '' };
  const client = new GitHubClient('interdomestik/interdomestik', token, async (...args) => {
    if (budget.requests >= REQUEST_LIMIT) budget.reason ||= 'request-budget';
    if (budget.reason) throw new Error(`feedback budget deferred: ${budget.reason}`);
    // Reserve synchronously: concurrent pagination/feedback reads cannot overshoot.
    budget.requests++;
    const response = await fetchImpl(...args);
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resource = response.headers.get('x-ratelimit-resource');
    if (
      response.status === 429 ||
      (response.status === 403 && (remaining === '0' || response.headers.has('retry-after')))
    ) {
      budget.reason ||= 'rate-limited';
    } else if (
      !['core', 'graphql'].includes(resource) ||
      !/^\d+$/u.test(remaining ?? '') ||
      !Number.isSafeInteger(Number(remaining))
    ) {
      budget.reason ||= 'quota-unknown';
    } else if (Number(remaining) <= SHARED_QUOTA_FLOOR) {
      budget.reason ||= 'shared-quota';
    }
    // Preserve the outcome of a request already accepted, especially the final POST.
    return response;
  });
  client.budget = budget;
  return client;
}
