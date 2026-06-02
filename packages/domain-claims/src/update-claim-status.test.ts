import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from './claims/types';
import { updateClaimStatus } from './update-claim-status';

const mocks = vi.hoisted(() => {
  class MockClaimTransitionConflictError extends Error {}
  const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const tx = { insert: vi.fn(), select: vi.fn(() => selectChain), update: vi.fn() };

  return {
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    claims: {
      branchId: 'claims.branch_id',
      id: 'claims.id',
      staffId: 'claims.staff_id',
      status: 'claims.status',
      tenantId: 'claims.tenant_id',
    },
    db: { transaction: vi.fn(async cb => cb(tx)) },
    ensureTenantId: vi.fn(() => 'tenant-1'),
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    MockClaimTransitionConflictError,
    selectChain,
    transition: vi.fn(),
    tx,
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  claims: mocks.claims,
  db: mocks.db,
  eq: mocks.eq,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({ withTenant: mocks.withTenant }));
vi.mock('@interdomestik/shared-auth', () => ({ ensureTenantId: mocks.ensureTenantId }));
vi.mock('./claims/transition', () => ({
  ClaimTransitionConflictError: mocks.MockClaimTransitionConflictError,
  transitionClaimStatusInTransaction: mocks.transition,
}));

const ok = { success: true, error: undefined };
const failure = (error: string) => ({ success: false, error, data: undefined });

function session(options: { branchId?: string | null; role?: string } = {}): ClaimsSession {
  return {
    user: {
      id: 'staff-1',
      role: options.role ?? 'staff',
      tenantId: 'tenant-1',
      ...(options.branchId !== undefined ? { branchId: options.branchId } : {}),
    },
  } as unknown as ClaimsSession;
}

function call(overrides: Partial<Parameters<typeof updateClaimStatus>[0]> = {}) {
  return updateClaimStatus({
    claimId: 'claim-1',
    newStatus: 'evaluation',
    session: session({ branchId: 'branch-1' }),
    ...overrides,
  });
}

describe('updateClaimStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.limit.mockResolvedValue([{ id: 'claim-1', status: 'submitted' }]);
    mocks.transition.mockResolvedValue({
      fromStatus: 'submitted',
      lifecycleVersion: 2,
      status: 'evaluation',
      success: true,
    });
  });

  it('preserves authorization and status validation errors', async () => {
    await expect(call({ session: session({ role: 'agent' }) })).resolves.toEqual(
      failure('Unauthorized')
    );
    await expect(call({ newStatus: 'not-a-status' })).resolves.toEqual(failure('Invalid status'));
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it('keeps branch scope and delegates success to the transition command', async () => {
    await expect(call({ note: 'picked for review' })).resolves.toEqual(ok);
    expect(mocks.eq).toHaveBeenCalledWith('claims.branch_id', 'branch-1');
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'claims.tenant_id',
      expect.any(Object)
    );
    expect(mocks.transition).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({
        actor: { id: 'staff-1', role: 'staff' },
        claimId: 'claim-1',
        isPublic: true,
        note: 'picked for review',
        requiredWhereCondition: expect.any(Object),
        tenantId: 'tenant-1',
        toStatus: 'evaluation',
      })
    );
    expect(mocks.tx.update).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });

  it('keeps assigned-staff scope when the staff user has no branch', async () => {
    await call({ session: session({ branchId: null }) });

    expect(mocks.eq).toHaveBeenCalledWith('claims.staff_id', 'staff-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('claims.branch_id', expect.anything());
  });

  it('preserves scoped miss and unchanged-status no-op behavior', async () => {
    mocks.selectChain.limit.mockResolvedValueOnce([]);
    await expect(call()).resolves.toEqual(failure('Claim not found or access denied'));

    mocks.selectChain.limit.mockResolvedValueOnce([{ id: 'claim-1', status: 'evaluation' }]);
    await expect(call()).resolves.toEqual(ok);
    expect(mocks.transition).not.toHaveBeenCalled();

    mocks.selectChain.limit.mockResolvedValueOnce([{ id: 'claim-1', status: 'evaluation' }]);
    await expect(call({ note: 'status context only' })).resolves.toEqual(ok);
    expect(mocks.transition).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ note: 'status context only', toStatus: 'evaluation' })
    );
  });

  it('maps command rejection without writing status directly', async () => {
    mocks.transition.mockResolvedValue({ success: false, error: 'transition_rejected' });

    await expect(call({ newStatus: 'negotiation' })).resolves.toEqual(
      failure('Failed to update claim status')
    );
    expect(mocks.tx.update).not.toHaveBeenCalled();
    expect(mocks.tx.insert).not.toHaveBeenCalled();
  });
});
