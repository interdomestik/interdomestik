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

  it('rejects unauthorized callers', async () => {
    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member reviewed and accepted the negotiation path.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'member-1', role: 'member' }),
      termsVersion: '2026-03-v1',
    });

    expect(result).toEqual({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('validates the commercial cap against the agreed fee percentage', async () => {
    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member approved the recovery path.',
      feePercentage: 25,
      legalActionCapPercentage: 15,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result).toEqual({
      success: false,
      error: 'Legal-action cap must be greater than or equal to the agreed fee percentage',
    });
  });

  it('creates a new escalation agreement snapshot for an in-scope claim', async () => {
    mockAgreementSaveSelects();

    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted commercial terms for negotiation.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result.success).toBe(true);
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.claimEscalationAgreements);
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        acceptedById: 'staff-1',
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member accepted commercial terms for negotiation.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
        signedByUserId: 'member-1',
        termsVersion: '2026-03-v1',
      })
    );
    expect(result.data).toMatchObject({
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted commercial terms for negotiation.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: '25.00',
      paymentAuthorizationState: 'authorized',
      termsVersion: '2026-03-v1',
    });
  });

  it('denies saving escalation agreements for claims outside the acting staff scope', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([]);
    mocks.agreementSelectChain.limit.mockResolvedValue([]);

    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'negotiation',
      decisionReason: 'Member accepted commercial terms for negotiation.',
      feePercentage: 15,
      legalActionCapPercentage: 25,
      minimumFee: 25,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      termsVersion: '2026-03-v1',
    });

    expect(result).toEqual({
      success: false,
      error: 'Claim not found or access denied',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });
});
