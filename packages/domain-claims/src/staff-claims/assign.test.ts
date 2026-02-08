import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { assignClaimCore } from './assign';

const mocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  const updateChain = {
    set: vi.fn(),
  };

  const updateSetChain = {
    where: vi.fn(),
  };

  const updateWhereChain = {
    returning: vi.fn(),
  };

  return {
    selectChain,
    updateChain,
    updateSetChain,
    updateWhereChain,
    select: vi.fn(),
    update: vi.fn(),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    logAuditEvent: vi.fn(),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      assignedAt: 'claims.assigned_at',
      assignedById: 'claims.assigned_by_id',
      updatedAt: 'claims.updated_at',
    },
  };
});

vi.mock('@interdomestik/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
  claims: mocks.claims,
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
  tenantId?: string;
  branchId?: string | null;
  role?: string;
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

describe('staff assignClaimCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.update.mockReturnValue(mocks.updateChain);
    mocks.updateChain.set.mockReturnValue(mocks.updateSetChain);
    mocks.updateSetChain.where.mockReturnValue(mocks.updateWhereChain);
  });

  it('denies cross-tenant assignment with a generic error and no mutation', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', tenantId: 'tenant-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('denies branch mismatch when staff branch is present', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.eq).toHaveBeenCalledWith('claims.branch_id', 'branch-1');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('denies takeover when claim is assigned to another staff member', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-2', branchId: 'branch-1' },
    ]);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Claim is already assigned to another staff member',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows first self-assign in scope for branch staff', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: null, branchId: 'branch-1' },
    ]);
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);

    const result = await assignClaimCore(
      {
        claimId: 'claim-1',
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
        requestHeaders: new Headers(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('returns idempotent success without mutation when already assigned to same staff', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-1', branchId: 'branch-1' },
    ]);

    const result = await assignClaimCore(
      {
        claimId: 'claim-1',
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
        requestHeaders: new Headers(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('denies branchless staff self-assign on unassigned claims', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: null }),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.eq).toHaveBeenCalledWith('claims.staff_id', 'staff-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('claims.branch_id', expect.anything());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows branchless staff idempotent reaffirm only for own assigned claims', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-1', branchId: 'branch-9' },
    ]);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: null }),
    });

    expect(result).toEqual({ success: true });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns generic denial when atomic assignment guard loses race', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: null, branchId: 'branch-1' },
    ]);
    mocks.updateWhereChain.returning.mockResolvedValue([]);

    const result = await assignClaimCore(
      {
        claimId: 'claim-1',
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
