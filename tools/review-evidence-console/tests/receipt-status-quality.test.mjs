import assert from 'node:assert/strict';
import test from 'node:test';

import { receiptStatus } from '../public/src/views/receipt-status.mjs';

const identity = {
  assignmentId: 'assign_a',
  reviewerFixtureId: 'reviewer_a',
  reviewerRole: 'governance',
  packetId: 'packet_a',
  packetRole: 'governance',
  packetVersion: '3',
};

function receipt(receiptId, overrides = {}) {
  return {
    ...identity,
    receiptId,
    submittedAt: '2026-07-10T00:00:00Z',
    ...overrides,
  };
}

test('fails closed without throwing for unbounded version segments', () => {
  const huge = receipt('huge', { packetVersion: '1'.repeat(10_000) });
  const excessive = receipt('excessive', {
    packetVersion: Array.from({ length: 100 }, () => '1').join('.'),
  });
  for (const evidence of [huge, excessive]) {
    assert.doesNotThrow(() => receiptStatus([evidence], identity));
    assert.deepEqual(receiptStatus([evidence], identity), { submissionStatus: null });
  }
});

test('memoizes shared lineage validity within one derivation', () => {
  let rootVisits = 0;
  const root = receipt('root');
  Object.defineProperty(root, 'previousReceiptId', {
    get() {
      rootVisits += 1;
      return undefined;
    },
  });
  const first = receipt('first', { previousReceiptId: 'root' });
  const second = receipt('second', { previousReceiptId: 'root' });
  assert.equal(receiptStatus([root, first, second], identity).submissionStatus, 'submitted');
  assert.equal(rootVisits, 1);
});

test('lineage keeps schema version one without enforcing receipt revision decrement', () => {
  const root = receipt('root', { schemaVersion: 1, receiptVersion: 1 });
  const correction = receipt('correction', {
    schemaVersion: 1,
    receiptVersion: 9,
    previousReceiptId: 'root',
    submittedAt: '2026-07-11T00:00:00Z',
  });
  assert.equal(root.schemaVersion, 1);
  assert.equal(correction.schemaVersion, 1);
  assert.equal(receiptStatus([root, correction], identity).receiptId, 'correction');
});

test('derives status from a deep valid lineage without overflowing the call stack', () => {
  const chain = Array.from({ length: 8_000 }, (_, index) =>
    receipt(`receipt_${index}`, {
      ...(index > 0 ? { previousReceiptId: `receipt_${index - 1}` } : {}),
    })
  ).reverse();
  let result;
  assert.doesNotThrow(() => {
    result = receiptStatus(chain, identity);
  });
  assert.equal(result.submissionStatus, 'submitted');
});
