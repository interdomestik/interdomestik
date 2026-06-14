import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeRecoveryCurrencyCode,
  normalizeRecoveryDate,
  resolveRecoverySuccessFeeCollectionSnapshot,
  type RecoverySuccessFeeCollectionSnapshotSource,
} from './index';

const baseSource: RecoverySuccessFeeCollectionSnapshotSource = {
  claimId: 'claim-1',
  collectionMethod: 'deduction',
  currencyCode: 'EUR',
  deductionAllowed: true,
  feeAmount: '150.00',
  hasStoredPaymentMethod: false,
  invoiceDueAt: null,
  paymentAuthorizationState: 'authorized',
  recoveredAmount: '1000.00',
  resolvedAt: '2026-03-12T09:00:00.000Z',
  subscriptionId: null,
};

test('domain-recovery resolves deduction success-fee collection only when deduction is allowed', () => {
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot({
      ...baseSource,
      deductionAllowed: false,
    }),
    null
  );
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot(baseSource)?.collectionMethod,
    'deduction'
  );
});

test('domain-recovery resolves invoice collection only with a usable due date', () => {
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot({
      ...baseSource,
      collectionMethod: 'invoice',
      invoiceDueAt: null,
    }),
    null
  );
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot({
      ...baseSource,
      collectionMethod: 'invoice',
      invoiceDueAt: '2026-03-19T09:00:00.000Z',
    })?.invoiceDueAt,
    '2026-03-19T09:00:00.000Z'
  );
});

test('domain-recovery resolves payment method charges only with authorization and subscription', () => {
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot({
      ...baseSource,
      collectionMethod: 'payment_method_charge',
      hasStoredPaymentMethod: true,
      subscriptionId: 'sub_123',
    })?.collectionMethod,
    'payment_method_charge'
  );
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot({
      ...baseSource,
      collectionMethod: 'payment_method_charge',
      hasStoredPaymentMethod: true,
      paymentAuthorizationState: 'pending',
      subscriptionId: 'sub_123',
    }),
    null
  );
});

test('domain-recovery rejects missing success-fee collection requirements', () => {
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot({
      ...baseSource,
      feeAmount: null,
    }),
    null
  );
});

test('domain-recovery normalizes invalid dates and currency codes predictably', () => {
  assert.equal(normalizeRecoveryDate('not-a-date'), null);
  assert.equal(normalizeRecoveryCurrencyCode('USDE'), 'EUR');
  assert.equal(normalizeRecoveryCurrencyCode('12$'), 'EUR');
});
