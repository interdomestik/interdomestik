import { inspect } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimFixture, transitionClaimFixture } from '../claims/lifecycle-test-support';
import {
  mocks,
  READY_ACCEPTED_RECOVERY_RECORD,
  type MockRecoveryAgreement,
} from './update-status-test-core';
import { updateClaimStatusCore } from './update-status';
import {
  createSession,
  expectBlockedStatusChange,
  mockRecoverySelects,
  runNegotiationUpdate,
} from './update-status-test-support';

describe('staff updateClaimStatusCore', () => {
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
  it.each([
    {
      agreement: [] as Array<MockRecoveryAgreement>,
      title: 'blocks negotiation until a recovery decision is recorded',
    },
    {
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          decisionType: null,
        },
      ],
      title: 'blocks negotiation until staff explicitly accept the recovery decision',
    },
  ])('$title', async ({ agreement }) => {
    mockRecoverySelects({ agreement });
    const result = await runNegotiationUpdate();
    expectBlockedStatusChange(
      result,
      'Staff must accept the recovery decision before staff-led recovery can begin.'
    );
  });
  it('blocks negotiation until the accepted escalation agreement is complete', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          paymentAuthorizationState: 'pending',
          signedAt: null,
        },
      ],
      claim: [{ id: 'claim-1', status: 'evaluation', userId: 'member-1', category: 'vehicle' }],
    });
    const result = await runNegotiationUpdate();
    expectBlockedStatusChange(
      result,
      'Save the accepted escalation agreement before staff-led recovery can begin.'
    );
  });

  it('blocks negotiation until the accepted case has a saved collection path', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          successFeeRecoveredAmount: null,
          successFeeCurrencyCode: null,
          successFeeAmount: null,
          successFeeCollectionMethod: null,
          successFeeDeductionAllowed: null,
          successFeeHasStoredPaymentMethod: null,
          successFeeInvoiceDueAt: null,
          successFeeResolvedAt: null,
          successFeeSubscriptionId: null,
        },
      ],
    });
    const result = await runNegotiationUpdate();
    expectBlockedStatusChange(
      result,
      'Save the success-fee collection path before staff-led recovery can begin.'
    );
  });

  it('blocks negotiation for guidance-only matters before staff-led recovery can begin', async () => {
    mockRecoverySelects({
      claim: [{ id: 'claim-1', status: 'evaluation', userId: 'member-1', category: 'travel' }],
    });
    const result = await runNegotiationUpdate();
    expectBlockedStatusChange(
      result,
      'This matter stays guidance-only or referral-only under the current launch scope and cannot move into staff-led recovery or success-fee handling.'
    );
  });

  it('allows recovery status transition when an accepted case has a valid invoice fallback path', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          successFeeCollectionMethod: 'invoice',
          successFeeHasStoredPaymentMethod: false,
          successFeeInvoiceDueAt: new Date('2026-03-19T09:00:00Z'),
          successFeeSubscriptionId: null,
        },
      ],
    });
    const result = await runNegotiationUpdate({
      note: 'member signed the agreement',
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        caseLifecycleState: 'recovery',
        recoveryLifecycleState: 'negotiation',
        updatedAt: expect.any(Date),
      })
    );
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        changedById: 'staff-1',
        changedByRole: 'staff',
        fromStatus: 'evaluation',
        isPublic: true,
        note: 'member signed the agreement',
        tenantId: 'tenant-1',
        toStatus: 'negotiation',
      })
    );
  });

  it('auto-assigns acting staff when an unassigned claim is triaged', async () => {
    mocks.tenantReadSelectChain.limit.mockResolvedValue([
      claimFixture('submitted', { staffId: null }),
    ]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'verification',
      note: 'Initial staff triage',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });
    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        lifecycleVersion: expect.objectContaining({ op: 'sql' }),
        caseLifecycleState: 'verification',
        recoveryLifecycleState: 'not_started',
        statusUpdatedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    );
    const [transitionWhereArg] = (mocks.txUpdateWhere.mock.calls[0] ?? []) as unknown[];
    const transitionWhere = inspect(transitionWhereArg, { depth: 20 });
    expect(transitionWhere).toContain('claims.branch_id');
    expect(transitionWhere).toContain('claims.lifecycle_version');
    expect(transitionWhere).toContain('claims.case_lifecycle_state');
    expect(transitionWhere).toContain('claims.recovery_lifecycle_state');
    expect(transitionWhere).not.toContain('claims.status');
    expect(mocks.txUpdateSet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        staffId: expect.objectContaining({ op: 'sql' }),
        assignedAt: expect.objectContaining({ op: 'sql' }),
        assignedById: expect.objectContaining({ op: 'sql' }),
        updatedAt: expect.any(Date),
      })
    );
    const updates = mocks.txUpdateSet.mock.calls as unknown as [{ updatedAt: Date }][];
    expect(mocks.sql.mock.calls.slice(1, 4)).toEqual([
      [expect.any(Array), mocks.claims.staffId, 'staff-1'],
      [
        expect.arrayContaining(['::timestamp)']),
        mocks.claims.assignedAt,
        updates[1][0].updatedAt.toISOString().slice(0, -1),
      ],
      [expect.any(Array), mocks.claims.assignedById, 'staff-1'],
    ]);
  });

  it('skips lifecycle-derived same-status requests without writing', async () => {
    const staleClaim = claimFixture('evaluation', { title: 'Vehicle claim', staffId: 'staff-1' });
    staleClaim.status = 'submitted';
    mocks.tenantReadSelectChain.limit.mockResolvedValue([staleClaim]);
    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'evaluation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it('sends a tenant-scoped notification for public staff status changes', async () => {
    const notifyStatusChanged = vi.fn().mockResolvedValue({ success: true });
    mocks.tenantReadSelectChain.limit.mockResolvedValue([
      claimFixture('submitted', { title: 'Vehicle claim', staffId: 'staff-1' }),
    ]);
    mocks.txSelectChain.limit.mockResolvedValueOnce([transitionClaimFixture('submitted')]);

    const result = await updateClaimStatusCore(
      {
        claimId: 'claim-1',
        newStatus: 'verification',
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      {
        notifyStatusChanged,
        projectClaimStatusAuditProjection: mocks.projectClaimStatusAuditProjection,
      }
    );

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.projectClaimStatusAuditProjection).toHaveBeenCalledWith({
      limit: 10,
      tenantId: 'tenant-1',
    });
    await vi.waitFor(() =>
      expect(notifyStatusChanged).toHaveBeenCalledWith(
        'member-1',
        'member@example.com',
        { id: 'claim-1', title: 'Vehicle claim' },
        'submitted',
        'verification',
        { tenantId: 'tenant-1' }
      )
    );
  });
});
