import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalStringify } from '../public/src/state/canonical-json.mjs';
import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';
import { makeStorage, receiptInput, submittedAt } from './state-fixtures.mjs';

const metadata = {
  packetId: receiptInput.packetId,
  assignmentId: receiptInput.assignmentId,
  reviewerFixtureId: receiptInput.reviewerFixtureId,
  reviewerRole: receiptInput.reviewerRole,
  packetRole: receiptInput.packetRole,
};

test('canonical JSON preserves own nested __proto__ keys without collisions', () => {
  const one = JSON.parse('{"nested":{"__proto__":{"value":"one"},"safe":true}}');
  const two = JSON.parse('{"nested":{"__proto__":{"value":"two"},"safe":true}}');
  assert.equal(canonicalStringify(one), '{"nested":{"__proto__":{"value":"one"},"safe":true}}');
  assert.notEqual(canonicalStringify(one), canonicalStringify(two));
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
});

test('different nested __proto__ values produce different receipt hashes and detect corruption', async () => {
  const firstInput = structuredClone(receiptInput);
  firstInput.decisions.item_a.audit = JSON.parse('{"__proto__":{"value":"one"}}');
  const secondInput = structuredClone(receiptInput);
  secondInput.decisions.item_a.audit = JSON.parse('{"__proto__":{"value":"two"}}');
  const first = await buildReceipt({ ...firstInput, submittedAt });
  const second = await buildReceipt({ ...secondInput, submittedAt });
  assert.notEqual(first.receiptId, second.receiptId);
  const corrupted = structuredClone(first);
  corrupted.decisions.item_a.audit.__proto__.value = 'changed';
  assert.equal((await verifyReceipt(corrupted)).code, 'hash_mismatch');
});

test('supports destructured receipt import', async () => {
  const storage = makeStorage();
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const { import: importReceipt } = createReceiptStore({
    storage,
    verifyReceipt,
    schemaVersion: 1,
  });
  assert.equal((await importReceipt(JSON.stringify(receipt), metadata)).ok, true);
  assert.equal(storage.length, 1);
});

test('rejects non-canonical nested values without storage mutation', async () => {
  const storage = makeStorage();
  const store = createReceiptStore({ storage, verifyReceipt, schemaVersion: 1 });
  const receipt = structuredClone(await buildReceipt({ ...receiptInput, submittedAt }));
  for (const audit of [{ missing: undefined }, new Date(submittedAt)]) {
    receipt.decisions.item_a.audit = audit;
    assert.equal((await store.save(receipt)).code, 'invalid_data');
  }
  assert.equal(storage.length, 0);
});

test('maps verifier failures across async store methods without mutation', async () => {
  const storage = makeStorage();
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const healthy = createReceiptStore({ storage, verifyReceipt, schemaVersion: 1 });
  assert.equal((await healthy.save(receipt)).ok, true);
  const failure = async () => {
    throw new Error('crypto unavailable');
  };
  const store = createReceiptStore({ storage, verifyReceipt: failure, schemaVersion: 1 });
  assert.equal((await store.save(receipt)).code, 'unavailable');
  assert.equal((await store.load(receipt.receiptId)).code, 'unavailable');
  assert.equal((await store.list(receipt.packetId)).code, 'unavailable');
  assert.equal((await store.export(receipt.receiptId)).code, 'unavailable');
  assert.equal((await store.import(JSON.stringify(receipt), metadata)).code, 'unavailable');
  assert.equal(storage.length, 1);
});
