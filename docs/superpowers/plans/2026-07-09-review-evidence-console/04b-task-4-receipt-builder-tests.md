# Task 4B: Receipt Builder Tests

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

- [ ] **Step 2: Write failing receipt determinism and correction tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalStringify } from '../public/src/state/canonical-json.mjs';
import { aggregateRisk, buildReceipt } from '../public/src/state/receipt-builder.mjs';

const receiptInput = {
  schemaVersion: 1,
  packetId: 'mob-03a-part-a',
  assignmentId: 'assign_a',
  reviewerFixtureId: 'reviewer_a',
  decisions: { item_a: { decision: 'approve', severity: 'high', riskCategory: 'privacy' } },
  authorityDisclaimer: 'Fixture authority only; no production decision.',
  reviewerRole: 'privacy',
  packetRole: 'privacy',
  structuredResponses: { item_a: { ownerRole: 'Privacy lead' } },
};
const reorderedReceiptInput = {
  decisions: receiptInput.decisions,
  structuredResponses: receiptInput.structuredResponses,
  authorityDisclaimer: receiptInput.authorityDisclaimer,
  packetRole: receiptInput.packetRole,
  reviewerRole: receiptInput.reviewerRole,
  reviewerFixtureId: 'reviewer_a',
  assignmentId: 'assign_a',
  packetId: 'mob-03a-part-a',
  schemaVersion: 1,
};

test('builds the same receipt ID for the same canonical payload', async () => {
  const submittedAt = '2026-07-09T12:00:00.000Z';
  const one = await buildReceipt({ ...receiptInput, submittedAt });
  const two = await buildReceipt({ ...reorderedReceiptInput, submittedAt });
  assert.equal(one.receiptId, two.receiptId);
  assert.match(one.receiptId, /^rec_[a-f0-9]{24}$/);
});

test('links correction versions without mutating the first receipt', async () => {
  const firstReceipt = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-09T12:00:00.000Z',
  });
  const correction = await buildReceipt({
    ...receiptInput,
    previousReceipt: firstReceipt,
    correctionItemId: 'item_a',
    correctionReason: 'Clarify evidence boundary.',
    correctionImpact: 'Improves auditability.',
  });
  assert.equal(correction.receiptVersion, 2);
  assert.equal(correction.previousReceiptId, firstReceipt.receiptId);
  assert.equal(firstReceipt.receiptVersion, 1);
});

test('sorts object keys recursively and preserves array order', () => {
  assert.equal(
    canonicalStringify({ z: 1, a: { y: 2, b: [3, 1] } }),
    '{"a":{"b":[3,1],"y":2},"z":1}'
  );
});

test('aggregates the highest severity and sorted unique risk categories', () => {
  assert.deepEqual(
    aggregateRisk([
      { severity: 'high', riskCategory: 'privacy' },
      { severity: 'high', riskCategory: 'legal' },
      { severity: 'low', riskCategory: 'privacy' },
    ]),
    { severity: 'high', categories: ['legal', 'privacy'] }
  );
});

test('requires correction item, reason, and impact for version two', async () => {
  const firstReceipt = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-09T12:00:00.000Z',
  });
  await assert.rejects(() => buildReceipt({ ...receiptInput, previousReceipt: firstReceipt }));
});
```
