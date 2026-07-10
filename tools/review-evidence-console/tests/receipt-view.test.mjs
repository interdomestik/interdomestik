import assert from 'node:assert/strict';
import test from 'node:test';
import { copy, fakeDocument, walk } from './fake-dom.mjs';
import { receiptInput, submittedAt } from './state-fixtures.mjs';
import { buildReceipt } from '../public/src/state/receipt-builder.mjs';

globalThis.document = fakeDocument;
const { renderReceipt } = await import('../public/src/views/receipt.mjs');

test('renders complete read-only receipt metadata, risk, evidence, and disclaimer', async () => {
  const complete = {
    ...receiptInput.decisions.item_a,
    concreteAnswer: 'Approve boundary.',
    reason: 'Evidence matches.',
    evidenceRef: 'docs/review.md#L1',
    verifiedAt: '2026-07-09',
    requestedChange: 'Clarify owner.',
  };
  const receipt = await buildReceipt({
    ...receiptInput,
    decisions: { item_a: complete },
    submittedAt,
  });
  const node = renderReceipt({ receipt, importNotice: 'Read on this device; never uploaded' });
  const content = copy(node);
  for (const value of [
    receipt.receiptId,
    'Version 1',
    receipt.reviewerDisplayName,
    receipt.reviewerRole,
    receipt.submittedAt,
    receipt.riskSummary.severity,
    receipt.authorityDisclaimer,
    receipt.packetId,
    receipt.packetVersion,
    complete.concreteAnswer,
    complete.reason,
    complete.evidenceRef,
    complete.verifiedAt,
    complete.requestedChange,
    'ownerRole',
    'Privacy lead',
    'Read on this device; never uploaded',
  ])
    assert.match(content, new RegExp(value));
  assert.equal(
    walk(node).some(entry => entry.tagName === 'INPUT' && !entry.attributes.readonly),
    false
  );
});

test('renders complete correction lineage metadata', async () => {
  const first = await buildReceipt({ ...receiptInput, submittedAt });
  const correction = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-10T12:00:00.000Z',
    previousReceipt: first,
    correctionItemId: 'item_a',
    correctionReason: 'Clarify boundary.',
    correctionImpact: 'Improves auditability.',
  });
  const content = copy(renderReceipt({ receipt: correction }));
  for (const value of [first.receiptId, 'item_a', 'Clarify boundary.', 'Improves auditability.'])
    assert.match(content, new RegExp(value));
});
