import { describe, expect, it } from 'vitest';

import { calculateSuccessFeeAmount, resolveSuccessFeeCollectionPlan } from './policy';

describe('calculateSuccessFeeAmount', () => {
  it('applies the minimum fee when the percentage fee falls below the agreed floor', () => {
    expect(
      calculateSuccessFeeAmount({
        minimumFee: 25,
        ratePercentage: 15,
        recoveryAmount: 100,
      })
    ).toEqual({
      feeAmount: 25,
      minimumApplied: true,
      minimumFee: 25,
      percentageFeeAmount: 15,
      ratePercentage: 15,
      recoveryAmount: 100,
    });
  });

  it('returns the percentage fee when it exceeds the agreed minimum', () => {
    expect(
      calculateSuccessFeeAmount({
        minimumFee: 25,
        ratePercentage: 15,
        recoveryAmount: 1000,
      })
    ).toEqual({
      feeAmount: 150,
      minimumApplied: false,
      minimumFee: 25,
      percentageFeeAmount: 150,
      ratePercentage: 15,
      recoveryAmount: 1000,
    });
  });
});

describe('resolveSuccessFeeCollectionPlan', () => {
  it('prefers payout deduction when deduction is legally allowed', () => {
    expect(
      resolveSuccessFeeCollectionPlan({
        deductionAllowed: true,
        hasStoredPaymentMethod: false,
        now: new Date('2026-03-12T09:00:00Z'),
        paymentAuthorizationState: 'pending',
      })
    ).toEqual({
      hasStoredPaymentMethod: false,
      invoiceDueAt: null,
      method: 'deduction',
      paymentAuthorizationState: 'pending',
    });
  });

  it('uses the stored payment method when deduction is unavailable and payment is authorized', () => {
    expect(
      resolveSuccessFeeCollectionPlan({
        deductionAllowed: false,
        hasStoredPaymentMethod: true,
        now: new Date('2026-03-12T09:00:00Z'),
        paymentAuthorizationState: 'authorized',
      })
    ).toEqual({
      hasStoredPaymentMethod: true,
      invoiceDueAt: null,
      method: 'payment_method_charge',
      paymentAuthorizationState: 'authorized',
    });
  });

  it('falls back to a seven-day invoice when no deductible payout or authorized stored payment method exists', () => {
    expect(
      resolveSuccessFeeCollectionPlan({
        deductionAllowed: false,
        hasStoredPaymentMethod: false,
        now: new Date('2026-03-12T09:00:00Z'),
        paymentAuthorizationState: 'revoked',
      })
    ).toEqual({
      hasStoredPaymentMethod: false,
      invoiceDueAt: '2026-03-19T09:00:00.000Z',
      method: 'invoice',
      paymentAuthorizationState: 'revoked',
    });
  });
});
