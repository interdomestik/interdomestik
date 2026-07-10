import assert from 'node:assert/strict';
import test from 'node:test';
import { copy, fakeDocument, walk } from './fake-dom.mjs';
import { receiptInput, submittedAt } from './state-fixtures.mjs';
import { buildReceipt } from '../public/src/state/receipt-builder.mjs';

globalThis.document = fakeDocument;
const { renderReceipt } = await import('../public/src/views/receipt.mjs');

test('renders complete read-only receipt metadata, risk, evidence, and disclaimer', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
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
    'Read on this device; never uploaded',
  ])
    assert.match(content, new RegExp(value));
  assert.equal(
    walk(node).some(entry => entry.tagName === 'INPUT' && !entry.attributes.readonly),
    false
  );
});
