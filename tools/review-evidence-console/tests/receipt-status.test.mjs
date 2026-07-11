import assert from 'node:assert/strict';
import test from 'node:test';

import { receiptStatus } from '../public/src/views/receipt-status.mjs';

const identity = Object.freeze({
  assignmentId: 'assign_a',
  reviewerFixtureId: 'reviewer_a',
  reviewerRole: 'governance',
  packetId: 'packet_a',
  packetRole: 'governance',
  packetVersion: '3',
});

function receipt(receiptId, submittedAt, overrides = {}) {
  return { ...identity, receiptId, submittedAt, ...overrides };
}

test('returns no status without same-identity receipt evidence', () => {
  const receipts = [receipt('other', '2026-07-10T00:00:00Z', { assignmentId: 'assign_b' })];
  assert.deepEqual(receiptStatus(receipts, identity), { submissionStatus: null });
});

test('selects the latest current root deterministically without mutating inputs', () => {
  const receipts = [
    receipt('rec_b', '2026-07-10T00:00:00Z'),
    receipt('rec_a', '2026-07-10T00:00:00Z'),
    receipt('rec_stale', '2026-07-12T00:00:00Z', { packetVersion: '2' }),
  ];
  const snapshot = structuredClone(receipts);
  assert.deepEqual(receiptStatus(receipts, identity), {
    submissionStatus: 'submitted',
    receiptId: 'rec_b',
    submittedAt: '2026-07-10T00:00:00Z',
    packetVersion: '3',
  });
  assert.deepEqual(receipts, snapshot);
});

test('accepts a current correction whose chain resolves to a current identical root', () => {
  const receipts = [
    receipt('root', '2026-07-09T00:00:00Z'),
    receipt('correction', '2026-07-10T00:00:00Z', { previousReceiptId: 'root' }),
  ];
  assert.equal(receiptStatus(receipts, identity).receiptId, 'correction');
});

test('rejects orphaned, cyclic, cross-identity, and cross-version correction chains', () => {
  const invalid = [
    receipt('orphan', '2026-07-14T00:00:00Z', { previousReceiptId: 'missing' }),
    receipt('cycle_a', '2026-07-13T00:00:00Z', { previousReceiptId: 'cycle_b' }),
    receipt('cycle_b', '2026-07-13T00:00:01Z', { previousReceiptId: 'cycle_a' }),
    receipt('cross_identity_root', '2026-07-09T00:00:00Z', { assignmentId: 'assign_b' }),
    receipt('cross_identity', '2026-07-12T00:00:00Z', {
      previousReceiptId: 'cross_identity_root',
    }),
    receipt('cross_version_root', '2026-07-08T00:00:00Z', { packetVersion: '2' }),
    receipt('cross_version', '2026-07-11T00:00:00Z', { previousReceiptId: 'cross_version_root' }),
    receipt('valid_root', '2026-07-07T00:00:00Z'),
  ];
  assert.equal(receiptStatus(invalid, identity).receiptId, 'valid_root');
});

test('returns review_required when only stale same-identity evidence exists', () => {
  assert.deepEqual(
    receiptStatus([receipt('old', '2026-07-10T00:00:00Z', { packetVersion: '2' })], identity),
    { submissionStatus: 'review_required' }
  );
});

test('does not treat an invalid current correction as stale evidence', () => {
  const invalid = receipt('orphan', '2026-07-10T00:00:00Z', {
    previousReceiptId: 'missing',
  });
  assert.deepEqual(receiptStatus([invalid], identity), { submissionStatus: null });
});
