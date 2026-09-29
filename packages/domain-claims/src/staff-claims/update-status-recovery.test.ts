import { inspect } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimFixture, transitionClaimFixture } from '../claims/lifecycle-test-support';
import { mocks, READY_ACCEPTED_RECOVERY_RECORD } from './update-status-test-core';
import { updateClaimStatusCore } from './update-status';
import {
  createSession,
  expectBlockedStatusChange,
  mockRecoverySelects,
  runNegotiationUpdate,
} from './update-status-test-support';

describe('staff updateClaimStatusCore recovery and scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txSelect
      .mockReset()
      .mockReturnValue(mocks.txSelectChain)
      .mockReturnValueOnce(mocks.tenantReadSelectChain);
    mocks.db.query.user.findFirst.mockResolvedValue({ email: 'member@example.com' });
    mocks.txSelectChain.limit.mockResolvedValue([transitionClaimFixture('evaluation')]);
    mocks.txInsertReturning.mockResolvedValue([{ id: 'usage-claim-1' }]);
    mocks.txUpdateReturning.mockResolvedValue([{ id: 'claim-1', lifecycleVersion: 2 }]);
    mocks.projectClaimStatusAuditProjection.mockResolvedValue(undefined);
  });
  it('denies status changes for claims outside the acting staff scope', async () => {
    mocks.tenantReadSelectChain.limit.mockResolvedValue([]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'verification',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Claim not found or access denied',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it('rejects invalid guarded transitions before status, history, or assignment writes', async () => {
    mocks.tenantReadSelectChain.limit.mockResolvedValue([
      claimFixture('submitted', { title: 'Vehicle claim', staffId: null }),
    ]);
    mocks.txSelectChain.limit.mockResolvedValueOnce([
      { id: 'claim-1', lifecycleVersion: 1, status: null },
    ]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'verification',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: false, error: 'Failed to update claim status' });
    expect(mocks.txUpdateSet).not.toHaveBeenCalled();
    expect(mocks.txInsertValues).not.toHaveBeenCalled();
  });

  it('blocks recovery status transition after staff accept the recovery decision when agreement terms are still missing', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          feePercentage: null,
          legalActionCapPercentage: null,
          minimumFee: null,
          paymentAuthorizationState: 'pending',
          signedAt: null,
          termsVersion: null,
        },
      ],
    });

    const result = await runNegotiationUpdate({
      note: 'Staff accepted the recovery decision and can now start work.',
    });

    expectBlockedStatusChange(
      result,
      'Save the accepted escalation agreement before staff-led recovery can begin.'
    );
  });

  it('locks and counts but skips insert when the claim already consumed a recovery matter', async () => {
    mockRecoverySelects({
      existingClaimUsage: [{ id: 'usage-claim-1' }],
    });

    const result = await runNegotiationUpdate();

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.serviceUsageCountSelectChain.limit).toHaveBeenCalledOnce();
    expect(mocks.txInsertOnConflictDoNothing).not.toHaveBeenCalled();
  });

  it('blocks staff-led recovery when annual matter allowance is exhausted without an override', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 2 }],
    });

    const result = await runNegotiationUpdate();

    expectBlockedStatusChange(
      result,
      'Matter allowance is exhausted. Record an override reason or upgrade the membership before staff-led recovery can begin.'
    );
    expect(mocks.txInsert).not.toHaveBeenCalledWith(mocks.serviceUsage);
  });

  it('records matter consumption once when staff-led recovery starts within allowance', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 1 }],
    });

    const result = await runNegotiationUpdate({
      note: 'Recovery accepted',
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.serviceUsage);
    expect(mocks.txInsertOnConflictDoNothing).toHaveBeenCalledWith({
      target: [
        mocks.serviceUsage.tenantId,
        mocks.serviceUsage.subscriptionId,
        mocks.serviceUsage.serviceCode,
      ],
    });
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceCode: 'staff_recovery_matter:claim-1',
        subscriptionId: 'sub-1',
        tenantId: 'tenant-1',
        userId: 'member-1',
      })
    );
  });

  it('allows exhausted allowance when an explicit override reason is recorded', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 2 }],
    });

    const result = await runNegotiationUpdate(
      {
        allowanceOverrideReason: 'Family upgrade is pending but recovery must start now',
      },
      {
        logAuditEvent: mocks.logAuditEvent,
        projectClaimStatusAuditProjection: mocks.projectClaimStatusAuditProjection,
      }
    );

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.serviceUsage);
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(mocks.projectClaimStatusAuditProjection).toHaveBeenCalledWith({
      limit: 10,
      tenantId: 'tenant-1',
    });
  });

  it('treats a conflicting recovery usage insert as an already consumed matter', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 1 }],
    });
    mocks.txInsertReturning.mockResolvedValueOnce([]);

    const result = await runNegotiationUpdate();

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txInsertOnConflictDoNothing).toHaveBeenCalledWith({
      target: [
        mocks.serviceUsage.tenantId,
        mocks.serviceUsage.subscriptionId,
        mocks.serviceUsage.serviceCode,
      ],
    });
  });

  it('requires an explicit reason when staff reject a recovery matter', async () => {
    mocks.tenantReadSelectChain.limit.mockResolvedValue([claimFixture('negotiation')]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'rejected',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Decline reason category is required when staff reject a recovery matter.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it('activates audit projection when staff decline a recovery matter', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    mocks.tenantReadSelectChain.limit.mockResolvedValue([claimFixture('negotiation')]);
    mocks.txSelectChain.limit
      .mockResolvedValueOnce([transitionClaimFixture('negotiation')])
      .mockResolvedValueOnce([]);

    const result = await updateClaimStatusCore(
      {
        claimId: 'claim-1',
        newStatus: 'rejected',
        declineReasonCode: 'no_monetary_recovery_path',
        decisionExplanation: 'Declined after review',
        requestHeaders,
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      {
        logAuditEvent: mocks.logAuditEvent,
        projectClaimStatusAuditProjection: mocks.projectClaimStatusAuditProjection,
      }
    );

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
    expect(mocks.projectClaimStatusAuditProjection).toHaveBeenCalledWith({
      limit: 10,
      tenantId: 'tenant-1',
    });
  });
});
