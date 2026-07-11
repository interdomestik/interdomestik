# Task 4C: Receipt Store Tests

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

- [ ] **Step 3: Write six failing receipt-store tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';

const makeStorage = () => {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};
const validReceipt = {
  schemaVersion: 1,
  receiptId: 'rec_aaaaaaaaaaaaaaaaaaaaaaaa',
  packetId: 'mob-03a-part-a',
  assignmentId: 'assign_a',
  reviewerFixtureId: 'reviewer_a',
  receiptVersion: 1,
  packetVersion: '1',
  reviewerDisplayName: 'Privacy reviewer',
  submittedAt: '2026-07-09T12:00:00.000Z',
  riskSummary: { severity: 'high', categories: ['privacy'] },
  reviewerRole: 'privacy',
  packetRole: 'privacy',
  authorityDisclaimer: 'Fixture authority only; no production decision.',
  decisions: { item_a: { decision: 'approve', severity: 'high', riskCategory: 'privacy' } },
  structuredResponses: { item_a: { ownerRole: 'Privacy lead' } },
};
const metadata = {
  packetId: validReceipt.packetId,
  assignmentId: validReceipt.assignmentId,
  reviewerFixtureId: validReceipt.reviewerFixtureId,
  reviewerRole: 'privacy',
  packetRole: 'privacy',
};
const okVerify = async receipt => ({ ok: true, value: receipt });

test('saves, lists, and loads one write-once receipt', () => {
  const store = createReceiptStore({
    storage: makeStorage(),
    verifyReceipt: okVerify,
    schemaVersion: 1,
  });
  assert.equal(store.save(validReceipt).ok, true);
  assert.deepEqual(store.list(validReceipt.packetId).value, [validReceipt]);
  assert.deepEqual(store.load(validReceipt.receiptId).value, validReceipt);
});

test('imports valid canonical JSON', async () => {
  const store = createReceiptStore({
    storage: makeStorage(),
    verifyReceipt: okVerify,
    schemaVersion: 1,
  });
  assert.deepEqual(await store.import(JSON.stringify(validReceipt), metadata), {
    ok: true,
    value: validReceipt,
  });
});

test('rejects malformed and field-invalid imports without storage mutation', async () => {
  const storage = makeStorage();
  const store = createReceiptStore({ storage, verifyReceipt: okVerify, schemaVersion: 1 });
  assert.equal((await store.import('{bad', metadata)).code, 'invalid_data');
  assert.equal(
    (await store.import(JSON.stringify({ ...validReceipt, assignmentId: 'wrong' }), metadata)).code,
    'invalid_data'
  );
  assert.equal(storage.length, 0);
});

test('removes a stored receipt explicitly', () => {
  const store = createReceiptStore({
    storage: makeStorage(),
    verifyReceipt: okVerify,
    schemaVersion: 1,
  });
  store.save(validReceipt);
  assert.equal(store.remove(validReceipt.receiptId).ok, true);
  assert.equal(store.load(validReceipt.receiptId).code, 'not_found');
});

for (const [name, verifyResult] of [
  ['hash mismatch', { ok: false, code: 'hash_mismatch', message: 'Receipt hash does not match.' }],
  [
    'schema mismatch',
    { ok: false, code: 'schema_mismatch', message: 'Receipt schema is incompatible.' },
  ],
]) {
  test(`rejects imported ${name}`, async () => {
    const storage = makeStorage();
    const store = createReceiptStore({
      storage,
      verifyReceipt: async () => verifyResult,
      schemaVersion: 1,
    });
    assert.deepEqual(await store.import(JSON.stringify(validReceipt), metadata), verifyResult);
    assert.equal(storage.length, 0);
  });
}

test('rejects packet, reviewer, or assignment metadata mismatch', async () => {
  const storage = makeStorage();
  const store = createReceiptStore({ storage, verifyReceipt: okVerify, schemaVersion: 1 });
  assert.equal(
    (await store.import(JSON.stringify(validReceipt), { ...metadata, assignmentId: 'other' })).code,
    'invalid_data'
  );
  assert.equal(storage.length, 0);
});

test('is idempotent for the same body and rejects the same id with another body', () => {
  const store = createReceiptStore({
    storage: makeStorage(),
    verifyReceipt: okVerify,
    schemaVersion: 1,
  });
  assert.equal(store.save(validReceipt).ok, true);
  assert.equal(store.save(validReceipt).ok, true);
  assert.equal(store.save({ ...validReceipt, receiptVersion: 2 }).code, 'hash_mismatch');
});
```
