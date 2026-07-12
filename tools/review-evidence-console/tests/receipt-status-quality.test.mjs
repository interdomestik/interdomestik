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
    receiptVersion: 1,
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

test('normalizes a zero-padded older packet version', () => {
  const zeroPadded = receipt('zero_padded', { packetVersion: '00' });
  assert.equal(
    receiptStatus([zeroPadded], { ...identity, packetVersion: '1' }).submissionStatus,
    'review_required'
  );
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
  const first = receipt('first', { receiptVersion: 2, previousReceiptId: 'root' });
  const second = receipt('second', { receiptVersion: 2, previousReceiptId: 'root' });
  assert.equal(receiptStatus([root, first, second], identity).submissionStatus, 'submitted');
  assert.equal(rootVisits, 1);
});

test('enforces canonical receipt revision lineage', () => {
  const root = receipt('root');
  const correction = receipt('correction', {
    receiptVersion: 2,
    previousReceiptId: 'root',
    submittedAt: '2026-07-11T00:00:00Z',
  });
  assert.equal(receiptStatus([root, correction], identity).receiptId, 'correction');

  const skipped = receipt('skipped', {
    receiptVersion: 9,
    previousReceiptId: 'root',
    submittedAt: '2026-07-12T00:00:00Z',
  });
  assert.equal(receiptStatus([root, skipped], identity).receiptId, 'root');

  const repeated = receipt('repeated', {
    receiptVersion: 2,
    previousReceiptId: 'correction',
    submittedAt: '2026-07-12T00:00:00Z',
  });
  assert.equal(receiptStatus([root, correction, repeated], identity).receiptId, 'correction');

  const decreasing = receipt('decreasing', {
    receiptVersion: 1,
    previousReceiptId: 'correction',
    submittedAt: '2026-07-12T00:00:00Z',
  });
  assert.equal(receiptStatus([root, correction, decreasing], identity).receiptId, 'correction');
  assert.deepEqual(receiptStatus([receipt('bad_root', { receiptVersion: 2 })], identity), {
    submissionStatus: null,
  });
});

test('derives status from a deep valid lineage without overflowing the call stack', () => {
  const chain = Array.from({ length: 8_000 }, (_, index) =>
    receipt(`receipt_${index}`, {
      receiptVersion: index + 1,
      ...(index > 0 ? { previousReceiptId: `receipt_${index - 1}` } : {}),
    })
  ).reverse();
  let result;
  assert.doesNotThrow(() => {
    result = receiptStatus(chain, identity);
  });
  assert.equal(result.submissionStatus, 'submitted');
});
