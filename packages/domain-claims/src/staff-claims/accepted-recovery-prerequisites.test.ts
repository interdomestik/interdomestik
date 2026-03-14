import { describe, expect, it } from 'vitest';

import {
  buildAcceptedRecoveryPrerequisitesSnapshot,
  buildCommercialAgreementSnapshot,
  buildSuccessFeeCollectionSnapshot,
} from './accepted-recovery-prerequisites';

describe('accepted recovery prerequisites', () => {
  it('treats an agreement as incomplete when the member signature timestamp is missing', () => {
    const result = buildCommercialAgreementSnapshot({
      acceptedAt: '2026-03-14T09:00:00.000Z',
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Clear insurer path and member approval captured.',
      feePercentage: 20,
      legalActionCapPercentage: 35,
      minimumFee: '25.00',
      paymentAuthorizationState: 'authorized',
      signedAt: null,
      termsVersion: '2026-03-v1',
    });

    expect(result).toBeNull();
  });

  it('treats an invoice fallback as incomplete until the invoice due date is persisted', () => {
    const result = buildSuccessFeeCollectionSnapshot({
      claimId: 'claim-1',
      collectionMethod: 'invoice',
      currencyCode: 'EUR',
      deductionAllowed: false,
      feeAmount: '150.00',
      hasStoredPaymentMethod: false,
      invoiceDueAt: null,
      paymentAuthorizationState: 'revoked',
      recoveredAmount: '1000.00',
      resolvedAt: '2026-03-14T09:00:00.000Z',
      subscriptionId: null,
    });

    expect(result).toBeNull();
  });

  it('marks an accepted recovery matter as blocked until agreement and collection prerequisites are both complete', () => {
    const result = buildAcceptedRecoveryPrerequisitesSnapshot({
      commercialAgreement: null,
      recoveryDecisionStatus: 'accepted',
      successFeeCollection: null,
    });

    expect(result).toEqual({
      agreementReady: false,
      canMoveForward: false,
      collectionPathReady: false,
      isAcceptedRecoveryDecision: true,
    });
  });

  it('allows forward progress when the accepted case has a valid invoice fallback collection path', () => {
    const result = buildAcceptedRecoveryPrerequisitesSnapshot({
      commercialAgreement: buildCommercialAgreementSnapshot({
        acceptedAt: '2026-03-14T09:00:00.000Z',
        claimId: 'claim-1',
        decisionNextStatus: 'negotiation',
        decisionReason: 'Clear insurer path and member approval captured.',
        feePercentage: 20,
        legalActionCapPercentage: 35,
        minimumFee: '25.00',
        paymentAuthorizationState: 'revoked',
        signedAt: '2026-03-14T09:00:00.000Z',
        termsVersion: '2026-03-v1',
      }),
      recoveryDecisionStatus: 'accepted',
      successFeeCollection: buildSuccessFeeCollectionSnapshot({
        claimId: 'claim-1',
        collectionMethod: 'invoice',
        currencyCode: 'EUR',
        deductionAllowed: false,
        feeAmount: '150.00',
        hasStoredPaymentMethod: false,
        invoiceDueAt: '2026-03-21T09:00:00.000Z',
        paymentAuthorizationState: 'revoked',
        recoveredAmount: '1000.00',
        resolvedAt: '2026-03-14T09:00:00.000Z',
        subscriptionId: null,
      }),
    });

    expect(result).toEqual({
      agreementReady: true,
      canMoveForward: true,
      collectionPathReady: true,
      isAcceptedRecoveryDecision: true,
    });
  });
});
