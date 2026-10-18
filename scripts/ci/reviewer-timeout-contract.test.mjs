import assert from 'node:assert/strict';
import test from 'node:test';
import { modelReviewRoutes } from './model-review-routes.mjs';
import { timeoutConfig } from './reviewer-route-utils.mjs';

test('Claude routes preserve the owner-authorized 45 minute budget', () => {
  for (const route of ['sonnet', 'opus', 'opus48']) {
    const timeouts = timeoutConfig(route);
    assert.equal(timeouts.totalTimeoutMs, 45 * 60_000);
    assert.equal(timeouts.firstOutputTimeoutMs, 45 * 60_000);
    assert.equal(modelReviewRoutes[route].timeoutMs, timeouts.totalTimeoutMs);
    assert.equal(modelReviewRoutes[route].noOutputTimeoutMs, timeouts.firstOutputTimeoutMs);
  }
});
