import assert from 'node:assert/strict';
import test from 'node:test';
import { startCorrection } from '../public/src/app/correction-controller.mjs';
import { bundle, priorReceipt } from './review-session-fixtures.mjs';
import { makeStorage } from './state-fixtures.mjs';
import { contextualDraftKey, draftWithUnknownField } from './contextual-draft-fixtures.mjs';

test('writes a correction draft linked to an immutable verified receipt', async () => {
  const receipt = await priorReceipt();
  const snapshot = structuredClone(receipt);
  const storage = makeStorage();
  const result = await startCorrection({
    bundle,
    receipt,
    storage,
    getLocalDate: () => assert.fail('correction must not read the local date'),
    metadata: {
      itemId: 'item_a',
      reason: 'Clarify the boundary.',
      impact: 'Improves auditability.',
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.correction.previousReceipt.receiptId, receipt.receiptId);
  assert.equal(result.value.activeItem, 'item_a');
  assert.equal(result.value.safeEvidenceConfirmed, false);
  assert.equal(result.value.suggestionVersion, 2);
  assert.equal(result.value.itemDecisions.item_a.decision, receipt.decisions.item_a.decision);
  assert.deepEqual(result.value.itemDecisions.item_a.responses, receipt.structuredResponses.item_a);
  assert.equal(result.value.itemDecisions.item_a.requestedChange, '');
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

test('derives packet context for correction load and save boundaries', async () => {
  const storage = makeStorage();
  const raw = JSON.stringify(draftWithUnknownField());
  storage.setItem(contextualDraftKey, raw);
  const result = await startCorrection({
    bundle,
    receipt: await priorReceipt(),
    storage,
    metadata: { itemId: 'item_a', reason: 'Clarify boundary.', impact: 'Improves auditability.' },
  });
  assert.equal(result.code, 'conflict');
  assert.equal(storage.getItem(contextualDraftKey), raw);
});
