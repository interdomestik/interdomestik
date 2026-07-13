import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { createReceiptStore } from '../public/src/state/receipt-store.mjs';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundle, priorReceipt } from './review-session-fixtures.mjs';
import { makeStorage, receiptInput, submittedAt, withReceiptId } from './state-fixtures.mjs';

const forbidden = [
  'suggestionVersion',
  'suggestedReview',
  'useSessionDateFor',
  'contextualNoteState',
  'retainedSidecar',
];
const contextualSidecars = ['contextualNoteState', 'statuses', 'retainedSidecar'];
const metadata = Object.fromEntries(
  [
    'packetId',
    'packetVersion',
    'assignmentId',
    'reviewerFixtureId',
    'reviewerRole',
    'packetRole',
  ].map(key => [key, receiptInput[key]])
);
const correction = {
  itemId: 'item_a',
  reason: 'Clarify the fixture boundary.',
  impact: 'Improves auditability.',
};

const mutations = forbidden.flatMap(key => [
  {
    label: `decision.${key}`,
    apply: receipt => (receipt.decisions.item_a[key] = { source: 'suggestion' }),
  },
  {
    label: `structuredResponses.${key}`,
    apply: receipt => (receipt.structuredResponses.item_a[key] = { source: 'suggestion' }),
  },
]);
mutations.push({
  label: 'structuredResponses.__proto__.suggestedReview',
  apply(receipt) {
    receipt.structuredResponses.item_a.context = JSON.parse(
      '{"__proto__":{"suggestedReview":{"source":"suggestion"}}}'
    );
  },
});
mutations.push({
  label: 'decision.unknownMetadata',
  apply: receipt => (receipt.decisions.item_a.unknownMetadata = 'not canonical'),
});

async function poisonedReceipt(apply, source = buildReceipt({ ...receiptInput, submittedAt })) {
  const receipt = structuredClone(await source);
  apply(receipt);
  return withReceiptId(receipt);
}

function storeFor(storage = makeStorage()) {
  return { storage, store: createReceiptStore({ storage, verifyReceipt, schemaVersion: 1 }) };
}

test('verify rejects rehashed receipts with nested suggestion metadata own keys', async () => {
  for (const mutation of mutations) {
    const result = await verifyReceipt(await poisonedReceipt(mutation.apply));
    assert.equal(result.code, 'invalid_data', mutation.label);
  }
});

test('write-once save rejects rehashed receipts with nested suggestion metadata', async () => {
  for (const mutation of mutations) {
    const { storage, store } = storeFor();
    const result = await store.save(await poisonedReceipt(mutation.apply));
    assert.equal(result.code, 'invalid_data', mutation.label);
    assert.equal(storage.length, 0, mutation.label);
  }
});

test('import rejects rehashed receipts with nested suggestion metadata', async () => {
  for (const mutation of mutations) {
    const { storage, store } = storeFor();
    const receipt = await poisonedReceipt(mutation.apply);
    const result = await store.import(JSON.stringify(receipt), metadata);
    assert.equal(result.code, 'invalid_data', mutation.label);
    assert.equal(storage.length, 0, mutation.label);
  }
});

test('load rejects directly stored rehashed receipts with nested suggestion metadata', async () => {
  for (const mutation of mutations) {
    const { storage, store } = storeFor();
    const receipt = await poisonedReceipt(mutation.apply);
    storage.setItem(`review-console:v2:receipt:${receipt.receiptId}`, JSON.stringify(receipt));
    assert.equal((await store.load(receipt.receiptId)).code, 'invalid_data', mutation.label);
  }
});

test('correction rejects rehashed prior receipts with nested suggestion metadata', async () => {
  for (const mutation of mutations) {
    const receipt = await poisonedReceipt(mutation.apply, priorReceipt());
    await assert.rejects(
      () => createReviewSession(bundle).createCorrection(receipt, correction),
      /receipt/i,
      mutation.label
    );
  }
});

test('nested response values may contain suggestion metadata words as ordinary text', async () => {
  const input = structuredClone(receiptInput);
  input.structuredResponses.item_a = {
    ownerRole: 'suggestionVersion suggestedReview useSessionDateFor',
    reviewerContext: { words: forbidden, note: 'These are quoted field names.' },
  };
  const receipt = await buildReceipt({ ...input, submittedAt });
  assert.equal((await verifyReceipt(receipt)).ok, true);
  assert.equal((await storeFor().store.save(receipt)).ok, true);
});

test('builder recursively excludes contextual sidecars from canonical decisions', async () => {
  const input = structuredClone(receiptInput);
  input.decisions.item_a.contextualNoteState = {
    requestedChange: {
      statuses: ['retained'],
      retainedSidecar: { suggestionVersion: 7 },
    },
  };
  const receipt = await buildReceipt({ ...input, submittedAt });
  const serialized = JSON.stringify(receipt.decisions);
  for (const key of contextualSidecars) assert.equal(serialized.includes(key), false, key);
});
