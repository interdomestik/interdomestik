import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';
import { makeStorage, receiptInput, submittedAt, withReceiptId } from './state-fixtures.mjs';

const metadata = {
  packetId: receiptInput.packetId,
  packetVersion: receiptInput.packetVersion,
  assignmentId: receiptInput.assignmentId,
  reviewerFixtureId: receiptInput.reviewerFixtureId,
  reviewerRole: receiptInput.reviewerRole,
  packetRole: receiptInput.packetRole,
};

async function setup() {
  const storage = makeStorage();
  const store = createReceiptStore({ storage, verifyReceipt, schemaVersion: 1 });
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  return { storage, store, receipt };
}

test('saves, lists, loads, and exports one verified write-once receipt', async () => {
  const { store, receipt } = await setup();
  assert.deepEqual(await store.save(receipt), { ok: true, value: receipt });
  assert.deepEqual(await store.list(receipt.packetId), { ok: true, value: [receipt] });
  assert.deepEqual(await store.load(receipt.receiptId), { ok: true, value: receipt });
  assert.deepEqual(await store.export(receipt.receiptId), {
    ok: true,
    value: JSON.stringify(receipt),
  });
});

test('is idempotent for the same canonical body', async () => {
  const { store, receipt } = await setup();
  assert.equal((await store.save(receipt)).ok, true);
  assert.deepEqual(await store.save(structuredClone(receipt)), { ok: true, value: receipt });
});

test('rejects the same ID with a different body', async () => {
  const { store, receipt } = await setup();
  await store.save(receipt);
  const changed = structuredClone(receipt);
  changed.decisions.item_a.decision = 'block';
  assert.equal((await store.save(changed)).code, 'hash_mismatch');
});

test('rejects invalid receipt schema and metadata before storage', async () => {
  const { storage, store, receipt } = await setup();
  assert.equal((await store.save({ ...receipt, schemaVersion: 2 })).code, 'schema_mismatch');
  assert.equal((await store.save({ ...receipt, packetId: undefined })).code, 'invalid_data');
  assert.equal(storage.length, 0);
});

test('imports JSON text only after hash and metadata verification', async () => {
  const { store, receipt } = await setup();
  assert.deepEqual(await store.import(JSON.stringify(receipt), metadata), {
    ok: true,
    value: receipt,
  });
  assert.equal((await store.import(receipt, metadata)).code, 'invalid_data');
});

test('rejects malformed or mismatched import without mutation', async () => {
  const { storage, store, receipt } = await setup();
  assert.equal((await store.import('{bad', metadata)).code, 'invalid_data');
  assert.equal(
    (await store.import(JSON.stringify(receipt), { ...metadata, assignmentId: 'other' })).code,
    'invalid_data'
  );
  const changed = structuredClone(receipt);
  changed.decisions.item_a.decision = 'block';
  assert.equal((await store.import(JSON.stringify(changed), metadata)).code, 'hash_mismatch');
  assert.equal(storage.length, 0);
});

test('detects nested storage corruption on load, list, and export', async () => {
  const { storage, store, receipt } = await setup();
  await store.save(receipt);
  const storageKey = storage.key(0);
  const corrupted = JSON.parse(storage.getItem(storageKey));
  corrupted.structuredResponses.item_a.ownerRole = 'Changed';
  storage.setItem(storageKey, JSON.stringify(corrupted));
  assert.equal((await store.load(receipt.receiptId)).code, 'hash_mismatch');
  assert.equal((await store.list(receipt.packetId)).code, 'hash_mismatch');
  assert.equal((await store.export(receipt.receiptId)).code, 'hash_mismatch');
});

test('removes only the requested receipt', async () => {
  const { store, receipt } = await setup();
  await store.save(receipt);
  assert.equal(store.remove(receipt.receiptId).ok, true);
  assert.equal((await store.load(receipt.receiptId)).code, 'not_found');
});

test('maps quota and browser storage exceptions to stable errors', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const quota = makeStorage();
  quota.setItem = () => {
    throw new DOMException('full', 'QuotaExceededError');
  };
  assert.equal(
    (await createReceiptStore({ storage: quota, verifyReceipt, schemaVersion: 1 }).save(receipt))
      .code,
    'quota'
  );
  const unavailable = makeStorage();
  unavailable.getItem = () => {
    throw new Error('disabled');
  };
  const store = createReceiptStore({ storage: unavailable, verifyReceipt, schemaVersion: 1 });
  assert.equal((await store.load(receipt.receiptId)).code, 'unavailable');
});

test('verifies forged first writes and idempotent saves before returning', async () => {
  const storage = makeStorage();
  let verifications = 0;
  const countingVerify = async receipt => {
    verifications += 1;
    return verifyReceipt(receipt);
  };
  const store = createReceiptStore({ storage, verifyReceipt: countingVerify, schemaVersion: 1 });
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const forged = { ...receipt, receiptId: 'rec_aaaaaaaaaaaaaaaaaaaaaaaa' };
  const rejected = await store.save(forged);
  assert.equal(rejected.code, 'hash_mismatch');
  assert.equal(rejected.message, 'Vërtetimi dështoi verifikimin e integritetit.');
  assert.equal(storage.length, 0);
  assert.equal((await store.save(receipt)).ok, true);
  assert.equal((await store.save(structuredClone(receipt))).ok, true);
  assert.equal(verifications, 3);
});

test('rejects semantic receipt violations including self-hashed nested imports', async () => {
  const { storage, store, receipt } = await setup();
  const changed = structuredClone(receipt);
  changed.decisions.item_a.decision = 'maybe';
  const malformed = await withReceiptId(changed);
  assert.equal((await store.import(JSON.stringify(malformed), metadata)).code, 'invalid_data');
  assert.equal(storage.length, 0);
  for (const invalid of [
    { ...receipt, receiptVersion: 0 },
    { ...receipt, correctionReason: 'Unexpected on v1' },
    { ...receipt, structuredResponses: { item_a: [] } },
  ]) {
    assert.equal((await store.save(invalid)).code, 'invalid_data');
  }
});
