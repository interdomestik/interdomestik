import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';
import { makeStorage, receiptInput, submittedAt } from './state-fixtures.mjs';

async function setup() {
  const storage = makeStorage();
  let verifications = 0;
  const store = createReceiptStore({
    storage,
    schemaVersion: 1,
    verifyReceipt: async receipt => {
      verifications += 1;
      return verifyReceipt(receipt);
    },
  });
  const first = await buildReceipt({ ...receiptInput, submittedAt });
  const second = await buildReceipt({
    ...receiptInput,
    assignmentId: 'assign_b',
    packetId: 'mob-03a-part-b',
    submittedAt: '2026-07-10T12:00:00.000Z',
  });
  await store.save(first);
  await store.save(second);
  verifications = 0;
  return { storage, store, first, second, count: () => verifications };
}

test('listAll scans storage once and verifies each receipt once before returning the batch', async () => {
  const { store, first, second, count } = await setup();
  assert.deepEqual(await store.listAll(), { ok: true, value: [first, second] });
  assert.equal(count(), 2);
});

test('listAll fails closed on any invalid evidence and returns no partial status batch', async () => {
  const { storage, store, first } = await setup();
  const key = `review-console:v1:receipt:${first.receiptId}`;
  const corrupted = JSON.parse(storage.getItem(key));
  corrupted.structuredResponses.item_a.ownerRole = 'Changed';
  storage.setItem(key, JSON.stringify(corrupted));
  const result = await store.listAll();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'hash_mismatch');
  assert.equal('value' in result, false);
});
