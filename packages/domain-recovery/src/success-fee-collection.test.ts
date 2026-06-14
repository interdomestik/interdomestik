import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRecoverySuccessFeeCollectionSnapshot,
  normalizeRecoveryCurrencyCode,
  resolveRecoverySuccessFeeCollectionSnapshot,
} from './index';
import {
  buildRecoverySuccessFeeCollectedPayload,
  recordRecoverySuccessFeeCollectedEvent,
} from './success-fee-collection-event';

test('domain-recovery owns success-fee collection snapshot normalization', () => {
  assert.deepEqual(
    buildRecoverySuccessFeeCollectionSnapshot({
      claimId: 'claim-1',
      collectionMethod: 'invoice',
      currencyCode: 'EUR',
      deductionAllowed: false,
      feeAmount: '150.00',
      hasStoredPaymentMethod: false,
      invoiceDueAt: new Date('2026-03-19T09:00:00.000Z'),
      paymentAuthorizationState: 'revoked',
      recoveredAmount: '1000.00',
      resolvedAt: '2026-03-12T09:00:00.000Z',
      subscriptionId: null,
    }),
    {
      claimId: 'claim-1',
      collectionMethod: 'invoice',
      currencyCode: 'EUR',
      deductionAllowed: false,
      feeAmount: '150.00',
      hasStoredPaymentMethod: false,
      invoiceDueAt: '2026-03-19T09:00:00.000Z',
      paymentAuthorizationState: 'revoked',
      recoveredAmount: '1000.00',
      resolvedAt: '2026-03-12T09:00:00.000Z',
      subscriptionId: null,
    }
  );
});

test('domain-recovery rejects incomplete or unusable success-fee collection paths', () => {
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot({
      claimId: 'claim-1',
      collectionMethod: 'payment_method_charge',
      currencyCode: 'EUR',
      deductionAllowed: false,
      feeAmount: '150.00',
      hasStoredPaymentMethod: true,
      paymentAuthorizationState: 'authorized',
      recoveredAmount: '1000.00',
      resolvedAt: '2026-03-12T09:00:00.000Z',
      subscriptionId: null,
    }),
    null
  );
  assert.equal(resolveRecoverySuccessFeeCollectionSnapshot(null), null);
});

test('domain-recovery rejects blank subscription ids for payment method charges', () => {
  assert.equal(
    resolveRecoverySuccessFeeCollectionSnapshot({
      claimId: 'claim-1',
      collectionMethod: 'payment_method_charge',
      currencyCode: 'EUR',
      deductionAllowed: false,
      feeAmount: '150.00',
      hasStoredPaymentMethod: true,
      paymentAuthorizationState: 'authorized',
      recoveredAmount: '1000.00',
      resolvedAt: '2026-03-12T09:00:00.000Z',
      subscriptionId: '   ',
    }),
    null
  );
});

test('domain-recovery exposes the sanitized success-fee collected event payload contract', () => {
  assert.deepEqual(
    buildRecoverySuccessFeeCollectedPayload({
      collectionMethod: 'deduction',
      currencyCode: normalizeRecoveryCurrencyCode(' eur '),
      deductionAllowed: true,
      hasStoredPaymentMethod: false,
      invoiceDueAt: null,
      paymentAuthorizationState: 'authorized',
    }),
    {
      collectionMethod: 'deduction',
      currencyCode: 'EUR',
      deductionAllowed: true,
      hasInvoiceDueDate: false,
      hasStoredPaymentMethod: false,
      paymentAuthorizationState: 'authorized',
    }
  );
});

test('domain-recovery preserves success-fee collected event identity and actor normalization', async () => {
  const inserted: unknown[] = [];
  const tx = {
    insert: () => ({
      values: (value: unknown) => {
        inserted.push(value);
        return {
          returning: () => Promise.resolve([{ id: 'event-1' }]),
        };
      },
    }),
  };

  await recordRecoverySuccessFeeCollectedEvent({
    actor: { id: 'staff-1', role: '   ' },
    claimId: 'claim-1',
    collectionMethod: 'deduction',
    currencyCode: 'EUR',
    deductionAllowed: true,
    hasStoredPaymentMethod: false,
    invoiceDueAt: null,
    now: new Date('2026-03-12T09:00:00.000Z'),
    paymentAuthorizationState: 'authorized',
    tenantId: 'tenant-1',
    tx: tx as never,
  });

  assert.equal(inserted.length, 1);
  const [event] = inserted as Array<Record<string, unknown>>;

  assert.equal(typeof event.id, 'string');
  assert.equal(event.actorId, 'staff-1');
  assert.equal(event.actorRole, 'staff');
  assert.equal(event.correlationId, 'claim:claim-1:recovery-success-fee-collected:deduction');
  assert.deepEqual(event.createdAt, new Date('2026-03-12T09:00:00.000Z'));
  assert.equal(event.eventName, 'recovery.success_fee_collected');
  assert.equal(event.eventVersion, 1);
  assert.deepEqual(event.payload, {
    collectionMethod: 'deduction',
    currencyCode: 'EUR',
    deductionAllowed: true,
    hasInvoiceDueDate: false,
    hasStoredPaymentMethod: false,
    paymentAuthorizationState: 'authorized',
  });
});
