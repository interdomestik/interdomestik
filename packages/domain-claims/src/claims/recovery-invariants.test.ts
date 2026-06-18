import { describe, expect, it } from 'vitest';

import { evaluateRecoveryInvariants, type RecoveryInvariantEvidence } from './recovery-invariants';

const baseEvidence: RecoveryInvariantEvidence = {
  claimId: 'claim-1',
  legalActionCapPercentage: 25,
  paymentAuthorizationState: 'authorized',
  signedAt: new Date('2026-03-12T09:00:00Z'),
};

const successFeeEvidence: RecoveryInvariantEvidence = {
  ...baseEvidence,
  successFeeAmount: '150.00',
  successFeeCollectionMethod: 'payment_method_charge',
  successFeeCurrencyCode: 'EUR',
  successFeeDeductionAllowed: false,
  successFeeHasStoredPaymentMethod: true,
  successFeeRecoveredAmount: '1000.00',
  successFeeResolvedAt: new Date('2026-03-13T09:00:00Z'),
  successFeeSubscriptionId: 'sub-1',
};

describe('T-203 recovery invariant evaluation', () => {
  it('requires signed authorized agreement for negotiation', () => {
    expect(
      evaluateRecoveryInvariants({ evidence: baseEvidence, toStatus: 'negotiation' })
    ).toBeNull();
    expect(
      evaluateRecoveryInvariants({
        evidence: { ...baseEvidence, paymentAuthorizationState: 'pending' },
        toStatus: 'negotiation',
      })
    ).toBe('signed_agreement_authorization_required');
  });

  it('requires legal-action cap for court', () => {
    expect(evaluateRecoveryInvariants({ evidence: baseEvidence, toStatus: 'court' })).toBeNull();
    expect(
      evaluateRecoveryInvariants({
        evidence: { ...baseEvidence, legalActionCapPercentage: null },
        toStatus: 'court',
      })
    ).toBe('legal_action_cap_required');
  });

  it('allows resolved with success-fee collection evidence', () => {
    expect(
      evaluateRecoveryInvariants({ evidence: successFeeEvidence, toStatus: 'resolved' })
    ).toBeNull();
  });

  it('allows resolved with documented no-fee evidence', () => {
    expect(
      evaluateRecoveryInvariants({
        evidence: {
          ...baseEvidence,
          noFeeDocumentedAt: new Date('2026-03-14T09:00:00Z'),
          noFeeDocumentedById: 'staff-1',
          noFeeReasonCode: 'no_recovery',
        },
        toStatus: 'resolved',
      })
    ).toBeNull();
  });

  it('rejects resolved without success-fee or no-fee evidence', () => {
    expect(evaluateRecoveryInvariants({ evidence: baseEvidence, toStatus: 'resolved' })).toBe(
      'success_fee_or_no_fee_required'
    );
  });
});
