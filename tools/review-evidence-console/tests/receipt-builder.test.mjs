import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalStringify } from '../public/src/state/canonical-json.mjs';
import {
  aggregateRisk,
  buildReceipt,
  verifyReceipt,
} from '../public/src/state/receipt-builder.mjs';
import { receiptInput, submittedAt } from './state-fixtures.mjs';

test('sorts object keys recursively while preserving array order', () => {
  assert.equal(
    canonicalStringify({ z: 1, a: { y: 2, b: [3, { d: 4, c: 5 }, 1] } }),
    '{"a":{"b":[3,{"c":5,"d":4},1],"y":2},"z":1}'
  );
});

test('builds the same deterministic receipt ID from reordered input', async () => {
  const reordered = Object.fromEntries(Object.entries(receiptInput).reverse());
  const one = await buildReceipt({ ...receiptInput, submittedAt });
  const two = await buildReceipt({ ...reordered, submittedAt });
  assert.equal(one.receiptId, two.receiptId);
  assert.match(one.receiptId, /^rec_[a-f0-9]{24}$/);
  assert.deepEqual(await verifyReceipt(one), { ok: true, value: one });
});

test('calls injected now exactly once when submittedAt is absent', async () => {
  let calls = 0;
  const receipt = await buildReceipt(receiptInput, {
    now: () => {
      calls += 1;
      return submittedAt;
    },
  });
  assert.equal(calls, 1);
  assert.equal(receipt.submittedAt, submittedAt);
});

test('aggregates none below low below medium below high', () => {
  assert.deepEqual(
    aggregateRisk([
      { severity: 'none', riskCategory: 'none' },
      { severity: 'medium', riskCategory: 'legal' },
      { severity: 'high', riskCategory: 'privacy' },
      { severity: 'high', riskCategory: 'legal' },
    ]),
    { severity: 'high', categories: ['legal', 'privacy'] }
  );
  assert.deepEqual(aggregateRisk([]), { severity: 'none', categories: [] });
});

test('links a complete correction without mutating the first receipt', async () => {
  const first = await buildReceipt({ ...receiptInput, submittedAt });
  const snapshot = structuredClone(first);
  const correction = await buildReceipt({
    ...receiptInput,
    submittedAt: '2026-07-09T13:00:00.000Z',
    previousReceipt: first,
    correctionItemId: 'item_a',
    correctionReason: 'Clarify evidence boundary.',
    correctionImpact: 'Improves auditability.',
  });
  assert.equal(correction.receiptVersion, 2);
  assert.equal(correction.previousReceiptId, first.receiptId);
  assert.equal(correction.correctionItemId, 'item_a');
  assert.deepEqual(first, snapshot);
});

test('requires all correction linkage fields', async () => {
  const previousReceipt = await buildReceipt({ ...receiptInput, submittedAt });
  await assert.rejects(() => buildReceipt({ ...receiptInput, previousReceipt }), /correction/i);
  await assert.rejects(
    () =>
      buildReceipt({
        ...receiptInput,
        previousReceipt,
        correctionItemId: 'item_a',
        correctionReason: '   ',
        correctionImpact: 'Improves auditability.',
      }),
    /correction/i
  );
});

test('deep-freezes the complete returned receipt', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  assert.equal(Object.isFrozen(receipt), true);
  assert.equal(Object.isFrozen(receipt.decisions.item_a), true);
  assert.throws(() => {
    receipt.decisions.item_a.decision = 'block';
  });
});

test('detects canonical hash corruption', async () => {
  const receipt = await buildReceipt({ ...receiptInput, submittedAt });
  const corrupted = structuredClone(receipt);
  corrupted.structuredResponses.item_a.ownerRole = 'Changed';
  assert.equal((await verifyReceipt(corrupted)).code, 'hash_mismatch');
});

test('rejects invalid previous receipt identity, version, schema, semantics, and self-linkage', async () => {
  const previousReceipt = await buildReceipt({ ...receiptInput, submittedAt });
  const invalidReceipts = [
    { ...previousReceipt, receiptVersion: 0 },
    { ...previousReceipt, receiptId: 'bad' },
    { ...previousReceipt, schemaVersion: 2 },
    {
      ...previousReceipt,
      decisions: { item_a: { decision: 'maybe', severity: 'high', riskCategory: 'privacy' } },
    },
    { ...previousReceipt, previousReceiptId: previousReceipt.receiptId },
  ];
  for (const previous of invalidReceipts) {
    await assert.rejects(
      () =>
        buildReceipt({
          ...receiptInput,
          previousReceipt: previous,
          correctionItemId: 'item_a',
          correctionReason: 'Clarify evidence boundary.',
          correctionImpact: 'Improves auditability.',
        }),
      /previous receipt/i
    );
  }
});
