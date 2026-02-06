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

  it('returns claims scoped to tenant', async () => {
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
      limit: 20,
    });

    expect(mocks.withTenant).toHaveBeenCalledTimes(1);
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.objectContaining({ op: 'inArray' })
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
      limit: 10,
    });

    expect(result).toEqual([]);
  });
});
