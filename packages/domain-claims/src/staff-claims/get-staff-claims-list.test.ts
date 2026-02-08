import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const claimChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };

  return {
    claimChain,
    db: { select: vi.fn() },
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      claimNumber: 'claims.claim_number',
      status: 'claims.status',
      updatedAt: 'claims.updated_at',
      userId: 'claims.user_id',
    },
    user: {
      id: 'user.id',
      name: 'user.name',
      memberNumber: 'user.member_number',
    },
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    desc: vi.fn(value => ({ value, op: 'desc' })),
    inArray: vi.fn((column, values) => ({ column, values, op: 'inArray' })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  claims: mocks.claims,
  user: mocks.user,
  eq: mocks.eq,
  and: mocks.and,
  desc: mocks.desc,
  inArray: mocks.inArray,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

import { getStaffClaimsList } from './get-staff-claims-list';

describe('getStaffClaimsList', () => {
  beforeEach(() => {
    mocks.db.select.mockReset();
    mocks.db.select.mockReturnValueOnce(mocks.claimChain);
    mocks.claimChain.from.mockReturnValue(mocks.claimChain);
    mocks.claimChain.leftJoin.mockReturnValue(mocks.claimChain);
    mocks.claimChain.where.mockReturnValue(mocks.claimChain);
    mocks.claimChain.orderBy.mockReturnValue(mocks.claimChain);
  });

  it('returns claims scoped to tenant and branch when branchId exists', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        status: 'submitted',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member One',
        memberNumber: 'M-0001',
      },
    ]);

    const result = await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
    });

    expect(mocks.withTenant).toHaveBeenCalledTimes(1);
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ op: 'inArray' }),
          expect.objectContaining({ op: 'eq', left: 'claims.branch_id', right: 'branch-1' }),
        ]),
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0].claimNumber).toBe('KS-0001');
    expect(result[0].memberNumber).toBe('M-0001');
  });

  it('returns empty when no claims match tenant', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    const result = await getStaffClaimsList({
      staffId: 'staff-2',
      tenantId: 'tenant-mk',
      branchId: 'branch-2',
      limit: 10,
    });

    expect(result).toEqual([]);
  });

  it('enforces staffId-only scope when branchId is null', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-3',
      tenantId: 'tenant-ks',
      branchId: null,
      limit: 10,
    });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ op: 'inArray' }),
          expect.objectContaining({ op: 'eq', left: 'claims.staff_id', right: 'staff-3' }),
        ]),
      })
    );
  });

  it('applies deterministic ordering by updatedAt DESC then id DESC', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-4',
      tenantId: 'tenant-ks',
      branchId: 'branch-4',
      limit: 10,
    });

    expect(mocks.claimChain.orderBy).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'desc', value: 'claims.updated_at' }),
      expect.objectContaining({ op: 'desc', value: 'claims.id' })
    );
  });
});
