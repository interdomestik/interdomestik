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
    userFindFirst: vi.fn(),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    or: vi.fn((...conditions) => ({ op: 'or', conditions })),
    isNull: vi.fn(column => ({ column, op: 'isNull' })),
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
    user: {
      branchId: 'user.branch_id',
      id: 'user.id',
      role: 'user.role',
      tenantId: 'user.tenant_id',
    },
  };
});

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      user: {
        findFirst: mocks.userFindFirst,
      },
    },
    select: mocks.select,
    update: mocks.update,
  },
  claims: mocks.claims,
  eq: mocks.eq,
  and: mocks.and,
  user: mocks.user,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('drizzle-orm', () => ({
  isNull: mocks.isNull,
  or: mocks.or,
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
    mocks.userFindFirst.mockResolvedValue({
      email: 'staff-two@example.com',
      id: 'staff-2',
      name: 'Staff Two',
    });
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

  it('rejects invalid assignee input fail-closed with no mutation', async () => {
    const result = await assignClaimCore({
      claimId: 'claim-1',
      staffId: { bad: true } as never,
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Invalid staff assignment',
      data: undefined,
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows manual reassignment within branch scope when the target staff is eligible', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-2', branchId: 'branch-1' },
    ]);
    mocks.userFindFirst.mockResolvedValueOnce({
      email: 'staff-three@example.com',
      id: 'staff-3',
      name: 'Staff Three',
    });
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);

    const result = await assignClaimCore(
      {
        claimId: 'claim-1',
        requestHeaders: new Headers(),
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
        staffId: 'staff-3',
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.userFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        assignedById: 'staff-1',
        staffId: 'staff-3',
      })
    );
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('allows first self-assign in scope for branch staff', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: null, branchId: 'branch-1' },
    ]);
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);

    const result = await assignClaimCore(
      {
        claimId: 'claim-1',
        requestHeaders: new Headers(),
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('denies manual assignment when the selected staff member is out of scope', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: null, branchId: 'branch-1' },
    ]);
    mocks.userFindFirst.mockResolvedValueOnce(null);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      staffId: 'staff-9',
    });

    expect(result).toEqual({
      success: false,
      error: 'Staff member not found or out of scope',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns idempotent success without mutation when already assigned to same staff', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-1', branchId: 'branch-1' },
    ]);

    const result = await assignClaimCore(
      {
        claimId: 'claim-1',
        requestHeaders: new Headers(),
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns idempotent success when claim is already assigned to the selected staff', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: 'staff-9', branchId: 'branch-1' },
    ]);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      staffId: 'staff-9',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('denies branchless staff when claim is not in scope', async () => {
    mocks.selectChain.limit.mockResolvedValue([]);

    const result = await assignClaimCore({
      claimId: 'claim-1',
      session: createSession({ userId: 'staff-1', branchId: null }),
    });

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.eq).toHaveBeenCalledWith('claims.staff_id', 'staff-1');
    expect(mocks.isNull).toHaveBeenCalledWith('claims.staff_id');
    expect(mocks.or).toHaveBeenCalled();
    expect(mocks.eq).not.toHaveBeenCalledWith('claims.branch_id', expect.anything());
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows branchless staff to assign a tenant staff member manually', async () => {
    mocks.selectChain.limit.mockResolvedValue([{ id: 'claim-1', staffId: null, branchId: null }]);
    mocks.userFindFirst.mockResolvedValueOnce({
      email: 'staff-nine@example.com',
      id: 'staff-9',
      name: 'Staff Nine',
    });
    mocks.updateWhereChain.returning.mockResolvedValue([{ id: 'claim-1' }]);

    const result = await assignClaimCore(
      {
        claimId: 'claim-1',
        requestHeaders: new Headers(),
        session: createSession({ userId: 'staff-1', branchId: null }),
        staffId: 'staff-9',
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('returns generic denial when manual assignment update loses race', async () => {
    mocks.selectChain.limit.mockResolvedValue([
      { id: 'claim-1', staffId: null, branchId: 'branch-1' },
    ]);
    mocks.userFindFirst.mockResolvedValueOnce({
      email: 'staff-nine@example.com',
      id: 'staff-9',
      name: 'Staff Nine',
    });
    mocks.updateWhereChain.returning.mockResolvedValue([]);

    const result = await assignClaimCore(
      {
        claimId: 'claim-1',
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
        staffId: 'staff-9',
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: false, error: 'Claim not found or access denied' });
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });
});
