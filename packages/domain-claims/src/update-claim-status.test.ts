import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from './claims/types';
import { updateClaimStatus } from './update-claim-status';

const mocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const transaction = vi.fn(async cb => cb({ update: txUpdate, insert: txInsert }));

  return {
    db: {
      select: vi.fn(),
      transaction,
    },
    selectChain,
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      status: 'claims.status',
      updatedAt: 'claims.updated_at',
    },
    claimStageHistory: {
      id: 'claim_stage_history.id',
      tenantId: 'claim_stage_history.tenant_id',
      claimId: 'claim_stage_history.claim_id',
      fromStatus: 'claim_stage_history.from_status',
      toStatus: 'claim_stage_history.to_status',
      changedById: 'claim_stage_history.changed_by_id',
      changedByRole: 'claim_stage_history.changed_by_role',
      note: 'claim_stage_history.note',
      isPublic: 'claim_stage_history.is_public',
      createdAt: 'claim_stage_history.created_at',
    },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    txUpdate,
    txUpdateSet,
    txUpdateWhere,
    txInsert,
    txInsertValues,
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  claims: mocks.claims,
  claimStageHistory: mocks.claimStageHistory,
  eq: mocks.eq,
  and: mocks.and,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

function createSession(options: {
  userId: string;
  role?: string;
  tenantId?: string;
  branchId?: string | null;
}): ClaimsSession {
  return {
    user: {
      id: options.userId,
      role: options.role ?? 'staff',
      tenantId: options.tenantId ?? 'tenant-1',
      ...(options.branchId !== undefined ? { branchId: options.branchId } : {}),
    },
  } as unknown as ClaimsSession;
}

describe('updateClaimStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
  });

  it('denies cross-tenant update', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    const result = await updateClaimStatus({
      claimId: 'claim-1',
      newStatus: 'evaluation',
      session: createSession({ userId: 'staff-1', tenantId: 'tenant-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Claim not found or access denied',
      data: undefined,
    });
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it('denies out-of-scope update when staff branch is present and mismatched', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    await updateClaimStatus({
      claimId: 'claim-1',
      newStatus: 'evaluation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(mocks.eq).toHaveBeenCalledWith('claims.branch_id', 'branch-1');
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it('denies out-of-scope update when branchless staff is not claim owner', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    await updateClaimStatus({
      claimId: 'claim-1',
      newStatus: 'evaluation',
      session: createSession({ userId: 'staff-1', branchId: null }),
    });

    expect(mocks.eq).toHaveBeenCalledWith('claims.staff_id', 'staff-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('claims.branch_id', expect.anything());
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it('persists status transition and timeline event in one transaction for in-scope update', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', status: 'submitted', staffId: 'staff-1', branchId: 'branch-1' },
    ]);

    const result = await updateClaimStatus({
      claimId: 'claim-1',
      newStatus: 'evaluation',
      note: 'picked for review',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.txUpdate).toHaveBeenCalledWith(mocks.claims);
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.claimStageHistory);
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        fromStatus: 'submitted',
        toStatus: 'evaluation',
        changedById: 'staff-1',
      })
    );
  });
});
