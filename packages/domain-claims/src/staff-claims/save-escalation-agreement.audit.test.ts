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

  it('records a commercial audit event when staff save recovery terms', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    mockAgreementSaveSelects();

    const result = await saveClaimEscalationAgreementCore(
      {
        authority,
        claimId: 'claim-1',
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member accepted commercial terms for negotiation.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: 25,
        paymentAuthorizationState: 'authorized',
        requestHeaders,
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
        termsVersion: '2026-03-v1',
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result.success).toBe(true);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.commercial_terms_saved',
        actorId: 'staff-1',
        actorRole: 'staff',
        entityId: 'claim-1',
        entityType: 'claim',
        headers: requestHeaders,
        authority,
        metadata: expect.objectContaining({
          decisionNextStatus: 'negotiation',
          decisionReason: 'Member accepted commercial terms for negotiation.',
          decisionType: 'accepted',
          feePercentage: 15,
          legalActionCapPercentage: 25,
          minimumFee: '25.00',
          paymentAuthorizationState: 'authorized',
          termsVersion: '2026-03-v1',
        }),
      })
    );
  });

  it('refreshes acceptance audit fields when staff resave an agreement', async () => {
    mockAgreementSaveSelects({
      agreements: [
        {
          acceptedAt: new Date('2026-03-11T09:00:00.000Z'),
          claimId: 'claim-1',
          decisionNextStatus: 'negotiation',
          decisionReason: 'Initial negotiation path was accepted.',
          feePercentage: 15,
          id: 'agreement-1',
          legalActionCapPercentage: 25,
          minimumFee: '25.00',
          paymentAuthorizationState: 'authorized',
          signedAt: new Date('2026-03-11T09:00:00.000Z'),
          termsVersion: '2026-03-v1',
        },
      ],
    });

    const result = await saveClaimEscalationAgreementCore({
      authority,
      claimId: 'claim-1',
      decisionNextStatus: 'court',
      decisionReason: 'Member requested escalation directly into the court path.',
      feePercentage: 20,
      legalActionCapPercentage: 30,
      minimumFee: 40,
      paymentAuthorizationState: 'authorized',
      session: createSession({ userId: 'staff-2', branchId: 'branch-1' }),
      termsVersion: '2026-03-v2',
    });

    expect(result.success).toBe(true);
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedAt: expect.any(Date),
        acceptedById: 'staff-2',
        decisionNextStatus: 'court',
        decisionReason: 'Member requested escalation directly into the court path.',
        feePercentage: 20,
        legalActionCapPercentage: 30,
        minimumFee: '40.00',
        paymentAuthorizationState: 'authorized',
        termsVersion: '2026-03-v2',
        updatedAt: expect.any(Date),
      })
    );
    expect(result.data).toMatchObject({
      claimId: 'claim-1',
      decisionNextStatus: 'court',
      decisionReason: 'Member requested escalation directly into the court path.',
      feePercentage: 20,
      legalActionCapPercentage: 30,
      minimumFee: '40.00',
      paymentAuthorizationState: 'authorized',
      signedAt: '2026-03-11T09:00:00.000Z',
      termsVersion: '2026-03-v2',
    });
    expect(result.data?.acceptedAt).not.toBe('2026-03-11T09:00:00.000Z');
  });
});
