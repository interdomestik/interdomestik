import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const claimChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  const agentChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  return {
    claimChain,
    agentChain,
    db: { select: vi.fn() },
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      claimNumber: 'claims.claim_number',
      status: 'claims.status',
      updatedAt: 'claims.updated_at',
      createdAt: 'claims.created_at',
      staffId: 'claims.staff_id',
      userId: 'claims.user_id',
      agentId: 'claims.agent_id',
    },
    user: {
      id: 'user.id',
      name: 'user.name',
      memberNumber: 'user.member_number',
    },
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  claims: mocks.claims,
  user: mocks.user,
  eq: mocks.eq,
  and: mocks.and,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

import { getStaffClaimDetail } from './get-staff-claim-detail';

describe('getStaffClaimDetail', () => {
  beforeEach(() => {
    mocks.db.select.mockReset();
    mocks.db.select.mockReturnValueOnce(mocks.claimChain).mockReturnValueOnce(mocks.agentChain);
    mocks.claimChain.from.mockReturnValue(mocks.claimChain);
    mocks.claimChain.leftJoin.mockReturnValue(mocks.claimChain);
    mocks.claimChain.where.mockReturnValue(mocks.claimChain);
    mocks.agentChain.from.mockReturnValue(mocks.agentChain);
    mocks.agentChain.where.mockReturnValue(mocks.agentChain);
  });

  it('returns member and claim details for tenant', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        claimId: 'claim-1',
        claimNumber: 'KS-0001',
        status: 'submitted',
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        memberId: 'member-1',
        memberName: 'Member One',
        memberNumber: 'MEM-001',
        agentId: 'agent-1',
        agentName: 'Agent One',
      },
    ]);
    mocks.agentChain.limit.mockResolvedValue([{ id: 'agent-1', name: 'Agent One' }]);

    const result = await getStaffClaimDetail({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      claimId: 'claim-1',
    });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.any(Object)
    );
    expect(result?.claim.claimNumber).toBe('KS-0001');
    expect(result?.member.membershipNumber).toBe('MEM-001');
    expect(result?.agent?.name).toBe('Agent One');
  });

  it('returns null when claim is outside tenant scope', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    const result = await getStaffClaimDetail({
      staffId: 'staff-9',
      tenantId: 'tenant-mk',
      claimId: 'claim-9',
    });

    expect(result).toBeNull();
  });
});
