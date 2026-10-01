import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createClaimRow } from './get-staff-claim-detail.test-support';

const mocks = await vi.hoisted(async () => {
  const { agreementColumns, claimsColumns, createDatabaseMock, userColumns } =
    await import('./get-staff-claim-detail.test-support');
  const claimChain = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const agentChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };

  return {
    claimChain,
    agentChain,
    databaseMock: () => createDatabaseMock({ select: mocks.rawDbSelect }, mocks),
    tx: { select: vi.fn() },
    rawDbSelect: vi.fn(() => {
      throw new Error('raw db must not be used for tenant-scoped staff claim detail reads');
    }),
    capturedContext: undefined as unknown,
    getMatterAllowanceVisibility: vi.fn(),
    withTenantContext: vi.fn((context: unknown, action: (tx: unknown) => unknown) => {
      mocks.capturedContext = context;
      return action(mocks.tx);
    }),
    claims: claimsColumns,
    claimEscalationAgreements: agreementColumns,
    user: userColumns,
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
});

vi.mock('@interdomestik/database', () => mocks.databaseMock());

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('./matter-allowance', () => ({
  getMatterAllowanceVisibilityForUser: mocks.getMatterAllowanceVisibility,
}));

import { getStaffClaimDetail } from './get-staff-claim-detail';

describe('getStaffClaimDetail tenant context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capturedContext = undefined;
    mocks.tx.select.mockReset();
    mocks.tx.select.mockReturnValueOnce(mocks.claimChain).mockReturnValueOnce(mocks.agentChain);
    mocks.claimChain.from.mockReturnValue(mocks.claimChain);
    mocks.claimChain.leftJoin.mockReturnValue(mocks.claimChain);
    mocks.claimChain.where.mockReturnValue(mocks.claimChain);
    mocks.agentChain.from.mockReturnValue(mocks.agentChain);
    mocks.agentChain.where.mockReturnValue(mocks.agentChain);
    mocks.getMatterAllowanceVisibility.mockResolvedValue(null);
  });

  it('reads the scoped claim through the tenant transaction and never touches the raw db handle', async () => {
    mocks.claimChain.limit.mockResolvedValue([createClaimRow({ agentId: null })]);
    mocks.agentChain.limit.mockResolvedValue([]);

    const result = await getStaffClaimDetail({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      claimId: 'claim-1',
    });

    expect(result?.member.id).toBe('member-1');
    expect(mocks.capturedContext).toEqual({ tenantId: 'tenant-ks' });
    expect(mocks.rawDbSelect).not.toHaveBeenCalled();
    expect(mocks.tx.select).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith(mocks.claims.userId, mocks.user.id);
  });

  it('threads the same tenant transaction into the optional agent read and matter allowance visibility check', async () => {
    mocks.claimChain.limit.mockResolvedValue([createClaimRow({ agentId: 'agent-1' })]);
    mocks.agentChain.limit.mockResolvedValue([{ id: 'agent-1', name: 'Agent One' }]);

    const result = await getStaffClaimDetail({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      claimId: 'claim-1',
    });

    expect(result?.agent?.id).toBe('agent-1');
    expect(mocks.tx.select).toHaveBeenCalledTimes(2);
    expect(mocks.rawDbSelect).not.toHaveBeenCalled();
    expect(mocks.getMatterAllowanceVisibility).toHaveBeenCalledWith({
      tx: mocks.tx,
      tenantId: 'tenant-ks',
      userId: 'member-1',
    });
  });

  it('preserves branch and staff scope predicates when reading inside the tenant transaction', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    const result = await getStaffClaimDetail({
      branchId: 'branch-2',
      staffId: 'staff-9',
      tenantId: 'tenant-mk',
      claimId: 'claim-9',
    });

    expect(result).toBeNull();
    expect(mocks.capturedContext).toEqual({ tenantId: 'tenant-mk' });
    expect(mocks.eq).toHaveBeenCalledWith(mocks.claims.branchId, 'branch-2');
    expect(mocks.eq).toHaveBeenCalledWith(mocks.claims.id, 'claim-9');
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-mk',
      mocks.claims.tenantId,
      expect.any(Object)
    );
    expect(mocks.rawDbSelect).not.toHaveBeenCalled();
    expect(mocks.getMatterAllowanceVisibility).not.toHaveBeenCalled();
  });

  it.each(['memberId', 'memberName'])('fails closed when the joined %s is missing', async field => {
    mocks.claimChain.limit.mockResolvedValue([
      createClaimRow({ [field]: null, agentId: 'agent-1' }),
    ]);

    const result = await getStaffClaimDetail({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      claimId: 'claim-1',
    });

    expect(result).toBeNull();
    expect(mocks.tx.select).toHaveBeenCalledTimes(1);
    expect(mocks.getMatterAllowanceVisibility).not.toHaveBeenCalled();
    expect(mocks.rawDbSelect).not.toHaveBeenCalled();
  });

  it('propagates errors from the tenant transaction instead of swallowing them', async () => {
    mocks.claimChain.limit.mockRejectedValue(new Error('connection reset'));

    await expect(
      getStaffClaimDetail({ staffId: 'staff-1', tenantId: 'tenant-ks', claimId: 'claim-1' })
    ).rejects.toThrow('connection reset');
    expect(mocks.rawDbSelect).not.toHaveBeenCalled();
  });
});
