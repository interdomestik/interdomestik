import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';
import { makeStorage, receiptInput, submittedAt } from './state-fixtures.mjs';

test('rejects a hash-valid receipt from a different packet version without mutation', async () => {
  const storage = makeStorage();
  const store = createReceiptStore({ storage, verifyReceipt, schemaVersion: 1 });
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const metadata = {
    packetId: receipt.packetId,
    packetVersion: 'different-version',
    assignmentId: receipt.assignmentId,
    reviewerFixtureId: receipt.reviewerFixtureId,
    reviewerRole: receipt.reviewerRole,
    packetRole: receipt.packetRole,
  };
  const result = await store.import(JSON.stringify(receipt), metadata);
  assert.equal(result.code, 'invalid_data');
  assert.equal(storage.length, 0);
});
