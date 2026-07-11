import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceipt } from '../public/src/state/receipt-builder.mjs';
import { receiptInput, submittedAt } from './state-fixtures.mjs';

test('selects only canonical reviewer-visible decision fields', async () => {
  const input = structuredClone(receiptInput);
  input.decisions.item_a = {
    decision: 'change',
    concreteAnswer: 'Keep the bounded review.',
    reason: 'The evidence supports a narrower scope.',
    evidenceRef: 'docs/review.md#L8',
    verifiedAt: '2026-07-09',
    riskCategory: 'privacy',
    severity: 'high',
    requestedChange: 'Limit the scope to fixture data.',
    responses: { retainedSidecar: 'must not leak' },
    status: 'suggested',
    statuses: { requestedChange: 'retained' },
    contextualNoteState: { requestedChange: { status: 'retained' } },
    suggestionVersion: 99,
  };
  const receipt = await buildReceipt({ ...input, submittedAt });
  assert.deepEqual(receipt.decisions.item_a, {
    concreteAnswer: 'Keep the bounded review.',
    decision: 'change',
    evidenceRef: 'docs/review.md#L8',
    reason: 'The evidence supports a narrower scope.',
    requestedChange: 'Limit the scope to fixture data.',
    riskCategory: 'privacy',
    severity: 'high',
    verifiedAt: '2026-07-09',
  });
});

test('omits requestedChange for approvals and includes it only when applicable', async () => {
  const approveInput = structuredClone(receiptInput);
  approveInput.decisions.item_a.requestedChange = 'Retained suggestion text.';
  const approval = await buildReceipt({ ...approveInput, submittedAt });
  assert.equal(Object.hasOwn(approval.decisions.item_a, 'requestedChange'), false);

  const blockInput = structuredClone(receiptInput);
  blockInput.decisions.item_a = {
    ...blockInput.decisions.item_a,
    decision: 'block',
    requestedChange: '  Add an explicit authority source.  ',
  };
  const blocked = await buildReceipt({ ...blockInput, submittedAt });
  assert.equal(blocked.decisions.item_a.requestedChange, 'Add an explicit authority source.');
});
