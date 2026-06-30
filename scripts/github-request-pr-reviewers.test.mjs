import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReviewRequestPlan,
  markerFor,
  promptBody,
} from './github-request-pr-reviewers.mjs';

const config = {
  botReviewers: [{ id: 'copilot', login: 'copilot-pull-request-reviewer[bot]' }],
  botPrompts: [
    { id: 'codex', body: '@codex review' },
  ],
};

test('reviewer plan requests missing bot reviewers and posts missing prompts', () => {
  const pr = {
    headRefOid: 'abc123',
    reviewRequests: [],
    comments: [{ body: markerFor('codex', 'abc123') }],
  };

  const plan = buildReviewRequestPlan({ config, pr });

  assert.deepEqual(
    plan.botReviewers.map(reviewer => reviewer.id),
    ['copilot']
  );
  assert.deepEqual(
    plan.botPrompts.map(prompt => prompt.id),
    []
  );
});

test('reviewer plan skips already-requested Copilot reviewer', () => {
  const pr = {
    headRefOid: 'abc123',
    reviewRequests: [{ login: 'copilot-pull-request-reviewer[bot]' }],
    comments: [],
  };

  const plan = buildReviewRequestPlan({ config, pr });

  assert.deepEqual(plan.botReviewers, []);
  assert.deepEqual(
    plan.botPrompts.map(prompt => prompt.id),
    ['codex']
  );
});

test('reviewer plan treats a new head as needing fresh Codex prompt', () => {
  const pr = {
    headRefOid: 'def456',
    reviewRequests: [{ login: 'copilot-pull-request-reviewer[bot]' }],
    comments: [{ body: markerFor('copilot', 'abc123') }, { body: markerFor('codex', 'abc123') }],
  };

  const plan = buildReviewRequestPlan({ config, pr });

  assert.deepEqual(plan.botReviewers, []);
  assert.deepEqual(
    plan.botPrompts.map(prompt => prompt.id),
    ['codex']
  );
});

test('prompt body keeps the mention first and embeds a current-head marker', () => {
  const body = promptBody({ id: 'codex', body: '@codex review' }, 'abc123');

  assert.match(body, /^@codex review/u);
  assert.match(body, /interdomestik-reviewer-request:codex:abc123/u);
});
