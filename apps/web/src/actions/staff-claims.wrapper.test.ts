import { describe, expect, it, vi } from 'vitest';

import {
  assignClaim,
  saveClaimEscalationAgreement,
  saveSuccessFeeCollection,
  updateClaimStatus,
} from './staff-claims';

vi.mock('./staff-claims/context', () => ({
  getActionContext: vi.fn(async () => ({
    requestHeaders: new Headers(),
    session: { user: { id: 'staff-1', role: 'staff' } },
  })),
}));

vi.mock('./staff-claims/assign', () => ({
  assignClaimCore: vi.fn(async () => ({ success: true })),
}));

vi.mock('./staff-claims/update-status', () => ({
  updateClaimStatusCore: vi.fn(async () => ({ success: true })),
}));

vi.mock('./staff-claims/save-escalation-agreement.core', () => ({
  saveClaimEscalationAgreementCore: vi.fn(async () => ({ success: true })),
}));

vi.mock('./staff-claims/save-success-fee-collection.core', () => ({
  saveSuccessFeeCollectionCore: vi.fn(async () => ({ success: true })),
}));

describe('staff-claims action wrapper', () => {
  it('delegates assignClaim to core', async () => {
    const { getActionContext } = await import('./staff-claims/context');
    const { assignClaimCore } = await import('./staff-claims/assign');

    const result = await assignClaim('claim-1');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(assignClaimCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      requestHeaders: expect.any(Headers),
      session: { user: { id: 'staff-1', role: 'staff' } },
    });
    expect(result).toEqual({ success: true });
  });

  it('delegates updateClaimStatus to core', async () => {
    const { getActionContext } = await import('./staff-claims/context');
    const { updateClaimStatusCore } = await import('./staff-claims/update-status');

    const result = await updateClaimStatus(
      'claim-1',
      'submitted' as unknown as import('./staff-claims/types').ClaimStatus,
      undefined,
      false,
      'Coverage upgrade is pending'
    );

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateClaimStatusCore).toHaveBeenCalledWith({
      allowanceOverrideReason: 'Coverage upgrade is pending',
      claimId: 'claim-1',
      newStatus: 'submitted',
      note: undefined,
      isPublicChange: false,
      requestHeaders: expect.any(Headers),
      session: { user: { id: 'staff-1', role: 'staff' } },
    });
    expect(result).toEqual({ success: true });
  });

  it('delegates saveClaimEscalationAgreement to core', async () => {
    const { getActionContext } = await import('./staff-claims/context');
    const { saveClaimEscalationAgreementCore } =
      await import('./staff-claims/save-escalation-agreement.core');

    const result = await saveClaimEscalationAgreement({
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted negotiation as the next recovery path.',
      feePercentage: 15,
      idempotencyKey: 'agreement-1',
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      termsVersion: '2026-03-v1',
    });

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(saveClaimEscalationAgreementCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted negotiation as the next recovery path.',
      feePercentage: 15,
      idempotencyKey: 'agreement-1',
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      requestHeaders: expect.any(Headers),
      session: { user: { id: 'staff-1', role: 'staff' } },
      termsVersion: '2026-03-v1',
    });
    expect(result).toEqual({ success: true });
  });

  it('delegates saveSuccessFeeCollection to core', async () => {
    const { getActionContext } = await import('./staff-claims/context');
    const { saveSuccessFeeCollectionCore } =
      await import('./staff-claims/save-success-fee-collection.core');

    const result = await saveSuccessFeeCollection({
      claimId: 'claim-1',
      deductionAllowed: false,
      recoveredAmount: 1000,
    });

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(saveSuccessFeeCollectionCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      deductionAllowed: false,
      recoveredAmount: 1000,
      requestHeaders: expect.any(Headers),
      session: { user: { id: 'staff-1', role: 'staff' } },
    });
    expect(result).toEqual({ success: true });
  });
});
