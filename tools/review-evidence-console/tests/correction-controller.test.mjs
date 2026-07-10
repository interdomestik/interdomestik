import assert from 'node:assert/strict';
import test from 'node:test';
import { startCorrection } from '../public/src/app/correction-controller.mjs';
import { bundle, priorReceipt } from './review-session-fixtures.mjs';
import { makeStorage } from './state-fixtures.mjs';

test('writes a correction draft linked to an immutable verified receipt', async () => {
  const receipt = await priorReceipt();
  const snapshot = structuredClone(receipt);
  const storage = makeStorage();
  const result = await startCorrection({
    bundle,
    receipt,
    storage,
    metadata: {
      itemId: 'item_a',
      reason: 'Clarify the boundary.',
      impact: 'Improves auditability.',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.correction.previousReceipt.receiptId, receipt.receiptId);
  assert.equal(result.value.activeItem, 'item_a');
  assert.deepEqual(receipt, snapshot);
});

test('rejects unsafe correction metadata without creating a draft', async () => {
  const result = await startCorrection({
    bundle,
    receipt: await priorReceipt(),
    storage: makeStorage(),
    metadata: { itemId: 'item_a', reason: 'reviewer@example.com', impact: 'Impact.' },
  });
  assert.equal(result.code, 'invalid_data');
});
