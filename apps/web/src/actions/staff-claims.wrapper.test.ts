import { describe, expect, it, vi } from 'vitest';

import { assignClaim, saveClaimEscalationAgreement, updateClaimStatus } from './staff-claims';

vi.mock('./staff-claims/context', () => ({
  getActionContext: vi.fn(async () => ({
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

describe('staff-claims action wrapper', () => {
  it('delegates assignClaim to core', async () => {
    const { getActionContext } = await import('./staff-claims/context');
    const { assignClaimCore } = await import('./staff-claims/assign');

    const result = await assignClaim('claim-1');

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(assignClaimCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
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
      false
    );

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(updateClaimStatusCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      newStatus: 'submitted',
      note: undefined,
      isPublicChange: false,
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
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      termsVersion: '2026-03-v1',
    });

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(saveClaimEscalationAgreementCore).toHaveBeenCalledWith({
      claimId: 'claim-1',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: { user: { id: 'staff-1', role: 'staff' } },
      termsVersion: '2026-03-v1',
    });
    expect(result).toEqual({ success: true });
  });
});
