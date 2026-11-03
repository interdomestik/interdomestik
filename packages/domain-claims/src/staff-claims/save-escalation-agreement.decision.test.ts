import {
  mocks,
  createSession,
  mockAgreementSaveSelects,
  authority,
} from './save-escalation-agreement.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveClaimEscalationAgreementCore } from './save-escalation-agreement';

describe('saveClaimEscalationAgreementCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txSelect.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
  });

  it('hydrates the member signature timestamp when staff save terms onto an accepted recovery decision row', async () => {
    mockAgreementSaveSelects({
      agreements: [
        {
          acceptedAt: new Date('2026-03-14T09:00:00.000Z'),
          claimId: 'claim-1',
          decisionNextStatus: null,
          decisionReason: 'Recovery decision accepted before commercial terms were saved.',
          feePercentage: null,
          id: 'agreement-1',
          legalActionCapPercentage: null,
          minimumFee: null,
          paymentAuthorizationState: 'pending',
          signedAt: null,
          termsVersion: null,
        },
      ],
    });

    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member approved the accepted negotiation path.',
      feePercentage: 20,
      legalActionCapPercentage: 30,
      minimumFee: 25,
      paymentAuthorizationState: 'revoked',
      session: createSession({ userId: 'staff-2', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result.success).toBe(true);
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedById: 'staff-2',
        decisionNextStatus: 'negotiation',
        paymentAuthorizationState: 'revoked',
        signedAt: expect.any(Date),
        signedByUserId: 'member-1',
      })
    );
    expect(result.data?.signedAt).toBeTruthy();
  });

  it('blocks escalation agreement saves for guidance-only matters', async () => {
    mockAgreementSaveSelects({
      claim: { category: 'travel' },
    });

    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Attempted to move a guidance-only matter into success-fee handling.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result).toEqual({
      success: false,
      error:
        'This matter stays guidance-only or referral-only under the current launch scope and cannot move into staff-led recovery or success-fee handling.',
    });
    expect(mocks.txInsert).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });
});
