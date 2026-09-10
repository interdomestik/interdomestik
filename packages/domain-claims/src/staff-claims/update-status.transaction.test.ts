import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimsSession } from '../claims/types';

const mocks = vi.hoisted(() => {
  const commit = vi.fn();
  const rollback = vi.fn();
  const returning = vi.fn();
  const tx = {
    select: vi.fn(),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({ returning })),
      })),
    })),
  };
  return {
    tx,
    commit,
    rollback,
    returning,
    load: vi.fn(),
    transition: vi.fn(),
    project: vi.fn(),
    notify: vi.fn(),
    subscription: vi.fn(),
    usage: vi.fn(),
    allowance: vi.fn(),
    withTenantContext: vi.fn(async (_context, action) => {
      try {
        const result = await action(tx);
        await commit();
        return result;
      } catch (error) {
        rollback();
        throw error;
      }
    }),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error('Global database access forbidden');
      },
    }
  ),
  claims: {},
  claimEscalationAgreements: {},
  serviceUsage: {},
  eq: vi.fn(),
  sql: vi.fn(),
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({ withTenant: vi.fn() }));
vi.mock('./current-claim-record', () => ({ loadStaffCurrentClaimRecord: mocks.load }));
vi.mock('../claims/transition', () => ({ transitionClaimStatusInTransaction: mocks.transition }));
vi.mock('../claims/audit-projection', () => ({
  activateClaimStatusAuditProjection: mocks.project,
}));
vi.mock('./scope', () => ({
  resolveScopedStaffClaimAccess: () => ({ tenantId: 'tenant-1' }),
  buildScopedStaffClaimWhere: () => ({ scoped: true }),
  STAFF_SCOPE_ACCESS_DENIED_ERROR: 'Claim not found or access denied',
}));
vi.mock('./commercial-handling-scope', () => ({
  resolveCommercialHandlingScopeGate: () => ({ scope: {}, error: null }),
}));
vi.mock('./accepted-recovery-prerequisites', () => ({
  buildAcceptedRecoveryPrerequisitesSnapshot: () => ({ collectionPathReady: true }),
  buildCommercialAgreementSnapshot: () => ({}),
  buildSuccessFeeCollectionSnapshot: () => ({}),
}));
vi.mock('./recovery-decision', () => ({
  buildRecoveryDecisionSnapshot: () => ({ status: 'accepted' }),
  getRecoveryDeclineMemberDescription: vi.fn(),
}));
vi.mock('./recovery-decision-record', () => ({ upsertRecoveryDecisionRecord: vi.fn() }));
vi.mock('./matter-allowance', () => ({
  getMatterAllowanceSubscriptionContextForUser: mocks.subscription,
  hasRecoveryMatterUsageForClaim: mocks.usage,
  getMatterAllowanceContextForSubscription: mocks.allowance,
  getRecoveryMatterServiceCode: () => 'staff_recovery_matter:claim-1',
}));

import { updateClaimStatusCore } from './update-status';

const run = () =>
  updateClaimStatusCore(
    {
      claimId: 'claim-1',
      newStatus: 'negotiation',
      isPublicChange: false,
      session: { user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' } } as ClaimsSession,
    },
    { notifyStatusChanged: mocks.notify }
  );

describe('staff status transaction boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.commit.mockReset();
    mocks.returning.mockReset().mockResolvedValue([{ id: 'usage-1' }]);
    mocks.load.mockResolvedValue({
      status: 'found',
      currentClaim: {
        status: 'evaluation',
        category: 'vehicle',
        userId: 'member-1',
        staffId: null,
        title: 'C',
      },
    });
    mocks.tx.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{}] }) }),
    });
    mocks.subscription.mockResolvedValue({ subscriptionId: 'sub-1' });
    mocks.usage.mockResolvedValue(false);
    mocks.allowance.mockResolvedValue({ consumedCount: 0, allowanceTotal: 2 });
    mocks.transition.mockResolvedValue({ success: true, fromStatus: 'evaluation' });
  });

  it('commits before effects', async () => {
    const order: string[] = [];
    mocks.commit.mockImplementation(() => {
      order.push('commit');
    });
    mocks.project.mockImplementation(async () => {
      order.push('project');
    });
    expect(await run()).toEqual({ success: true, error: undefined });
    expect(mocks.withTenantContext).toHaveBeenCalledExactlyOnceWith(
      { tenantId: 'tenant-1', role: 'staff' },
      expect.any(Function)
    );
    expect(mocks.load).toHaveBeenCalledWith(mocks.tx, { scoped: true });
    expect(mocks.transition).toHaveBeenCalledWith(mocks.tx, expect.any(Object));
    for (const helper of [mocks.subscription, mocks.usage, mocks.allowance]) {
      expect(helper).toHaveBeenCalledWith(
        expect.objectContaining({ tx: mocks.tx, tenantId: 'tenant-1' })
      );
    }
    expect(mocks.allowance.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.usage.mock.invocationCallOrder[0]
    );
    for (const write of [mocks.tx.insert, mocks.tx.update]) expect(write).toHaveBeenCalledOnce();
    expect(order).toEqual(['commit', 'project']);
  });

  it('rolls back writes', async () => {
    mocks.returning.mockRejectedValueOnce(new Error('write failed'));
    expect(await run()).toEqual({ success: false, error: 'Failed to update claim status' });
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('commit failure', async () => {
    mocks.commit.mockRejectedValueOnce(new Error('commit failed'));
    expect(await run()).toEqual({ success: false, error: 'Failed to update claim status' });
    expect(mocks.rollback).toHaveBeenCalledOnce();
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
