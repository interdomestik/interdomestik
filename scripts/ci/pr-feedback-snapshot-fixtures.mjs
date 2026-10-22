import assert from 'node:assert/strict';
import { validRefresh, repository, base, head, merge } from './pr-feedback-refresh-fixtures.mjs';

export function feedbackClient() {
  const pull = validRefresh().pull;
  const data = { reviews: [], issueComments: [], comments: [], threads: [] };
  return {
    repository,
    pull,
    data,
    async request(endpoint) {
      if (endpoint === `repos/${repository}/pulls/17`) return structuredClone(pull);
      assert.equal(endpoint, `repos/${repository}/git/commits/${merge}`);
      return { parents: [{ sha: base }, { sha: head }] };
    },
    async pages(endpoint) {
      const route = new Map([
        [`repos/${repository}/pulls/17/reviews`, data.reviews],
        [`repos/${repository}/issues/17/comments`, data.issueComments],
        [`repos/${repository}/pulls/17/comments`, data.comments],
      ]);
      assert.ok(route.has(endpoint), endpoint);
      return { values: structuredClone(route.get(endpoint)), complete: true };
    },
    async graphql() {
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: data.threads,
              pageInfo: { hasNextPage: false },
            },
          },
        },
      };
    },
  };
}
