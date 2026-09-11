import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDeliverySnapshot } from './pr-delivery-gate.mjs';
import { B, H, contract, snapshot } from './pr-delivery-fixtures.mjs';

for (const [name, body, commitId, disposed, blocked] of [
  ['current-head finding', 'P1 finding: tenant data exposure', H, false, true],
  ['current-head badge', '![P2](https://img.shields.io/badge/P2-yellow) Defect.', H, false, true],
  ['stale finding', 'P1 finding: old defect', B, false, false],
  ['unbound finding', 'P1 finding: old defect', '', false, false],
  ['no-findings summary', 'No additional findings.', H, false, false],
  ['summary counts', 'Suppressed comments (1). Previously missed (1).', H, false, false],
  ['explicitly disposed finding', 'P1 finding: reviewed exception', H, true, false],
]) {
  test(`review body intake handles ${name}`, () => {
    const current = snapshot();
    current.feedback.reviews.push({
      id: 5001,
      author: 'openai-codex[bot]',
      commitId,
      state: 'COMMENTED',
      body,
      submittedAt: '2026-09-11T00:00:00Z',
    });
    if (disposed) current.feedback.disposedReviewIds.push(5001);
    if (blocked) {
      assert.throws(() => evaluateDeliverySnapshot(contract, current), /actionable feedback/u);
    } else {
      assert.equal(evaluateDeliverySnapshot(contract, current).ok, true);
    }
  });
}

test('a later benign review cannot silently dispose a same-head substantive finding', () => {
  const current = snapshot();
  current.feedback.reviews.push(
    {
      id: 5001,
      author: 'openai-codex[bot]',
      commitId: H,
      state: 'COMMENTED',
      body: 'P0 issue: tenant data exposure',
      submittedAt: '2026-09-11T00:00:00Z',
    },
    {
      id: 5002,
      author: 'openai-codex[bot]',
      commitId: H,
      state: 'COMMENTED',
      body: 'No additional findings.',
      submittedAt: '2026-09-11T00:01:00Z',
    }
  );
  assert.throws(() => evaluateDeliverySnapshot(contract, current), /actionable feedback/u);
});

test('dismissing a review clears its body but not unresolved threads or inline findings', () => {
  const current = snapshot();
  const dismissed = {
    id: 5001,
    author: 'openai-codex[bot]',
    commitId: H,
    state: 'DISMISSED',
    body: 'P1 finding: dismissed false positive',
    submittedAt: '2026-09-11T00:00:00Z',
  };
  current.feedback.reviews.push(dismissed);
  assert.equal(evaluateDeliverySnapshot(contract, current).ok, true);
  current.feedback.unresolvedThreads.push({ isResolved: false });
  assert.throws(() => evaluateDeliverySnapshot(contract, current), /unresolved review threads/u);
  current.feedback.unresolvedThreads = [];
  current.feedback.reviewComments.push({
    author: dismissed.author,
    commitId: H,
    body: 'P1 finding: unresolved inline defect',
    createdAt: '2026-09-11T00:00:00Z',
    resolved: false,
  });
  assert.throws(() => evaluateDeliverySnapshot(contract, current), /actionable feedback/u);
});
