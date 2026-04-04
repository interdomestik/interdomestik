import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const claimChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const historyChain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };

  return {
    claimChain,
    historyChain,
    db: { select: vi.fn() },
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      claimNumber: 'claims.claim_number',
      companyName: 'claims.company_name',
      status: 'claims.status',
      title: 'claims.title',
      updatedAt: 'claims.updated_at',
      userId: 'claims.user_id',
    },
    claimStageHistory: {
      id: 'claim_stage_history.id',
      tenantId: 'claim_stage_history.tenant_id',
      claimId: 'claim_stage_history.claim_id',
      note: 'claim_stage_history.note',
      createdAt: 'claim_stage_history.created_at',
    },
    user: {
      id: 'user.id',
      name: 'user.name',
      email: 'user.email',
      memberNumber: 'user.member_number',
    },
    aliasedTable: vi.fn((table, alias) => ({
      ...table,
      email: `${alias}.email`,
      id: `${alias}.id`,
      name: `${alias}.name`,
    })),
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    desc: vi.fn(value => ({ value, op: 'desc' })),
    ilike: vi.fn((column, value) => ({ column, value, op: 'ilike' })),
    inArray: vi.fn((column, values) => ({ column, values, op: 'inArray' })),
    or: vi.fn((...conditions) => ({ conditions, op: 'or' })),
    isNull: vi.fn(column => ({ column, op: 'isNull' })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  claims: mocks.claims,
  claimStageHistory: mocks.claimStageHistory,
  user: mocks.user,
  eq: mocks.eq,
  and: mocks.and,
  desc: mocks.desc,
  ilike: mocks.ilike,
  inArray: mocks.inArray,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('drizzle-orm', () => ({
  aliasedTable: mocks.aliasedTable,
  or: mocks.or,
  isNull: mocks.isNull,
}));

import { getStaffClaimsList } from './get-staff-claims-list';

function expectOwnOrUnassignedQueueScope(args: { staffId: string; tenantId: string }) {
  expect(mocks.withTenant).toHaveBeenCalledWith(
    args.tenantId,
    mocks.claims.tenantId,
    expect.objectContaining({
      op: 'and',
      conditions: expect.arrayContaining([
        expect.objectContaining({ op: 'inArray' }),
        expect.objectContaining({
          op: 'or',
          conditions: expect.arrayContaining([
            expect.objectContaining({ op: 'eq', left: 'claims.staff_id', right: args.staffId }),
            expect.objectContaining({ op: 'isNull', column: 'claims.staff_id' }),
          ]),
        }),
      ]),
    })
  );
}

describe('getStaffClaimsList', () => {
  beforeEach(() => {
    mocks.and.mockClear();
    mocks.db.select.mockReset();
    mocks.db.select.mockReturnValueOnce(mocks.claimChain).mockReturnValueOnce(mocks.historyChain);
    mocks.desc.mockClear();
    mocks.eq.mockClear();
    mocks.ilike.mockClear();
    mocks.inArray.mockClear();
    mocks.isNull.mockClear();
    mocks.or.mockClear();
    mocks.withTenant.mockClear();
    mocks.claimChain.from.mockReturnValue(mocks.claimChain);
    mocks.claimChain.leftJoin.mockReturnValue(mocks.claimChain);
    mocks.claimChain.where.mockReturnValue(mocks.claimChain);
    mocks.claimChain.orderBy.mockReturnValue(mocks.claimChain);
    mocks.historyChain.from.mockReturnValue(mocks.historyChain);
    mocks.historyChain.where.mockReturnValue(mocks.historyChain);
    mocks.historyChain.orderBy.mockResolvedValue([]);
  });

  it('returns all branch claims for branch managers when branchId exists', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        assigneeEmail: 'staff@example.com',
        assigneeName: 'Staff User',
        staffId: null,
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
      viewerRole: 'branch_manager',
    });

    expect(mocks.withTenant).toHaveBeenCalledTimes(2);
    expect(mocks.withTenant).toHaveBeenNthCalledWith(
      1,
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
    expect(result[0].isDiasporaOrigin).toBe(false);
  });

  it('falls back to own and unassigned claims when branch manager branch context is missing', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: null,
      limit: 20,
      viewerRole: 'branch_manager',
    });

    expectOwnOrUnassignedQueueScope({ staffId: 'staff-1', tenantId: 'tenant-ks' });
  });

  it('maps assignee details for queue operator context', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        companyName: 'Acme',
        title: 'Claim',
        status: 'verification',
        staffId: 'staff-2',
        assigneeName: 'Drita Gashi',
        assigneeEmail: 'drita@example.com',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member One',
        memberNumber: 'M-0001',
      },
    ]);

    const [result] = await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'branch_manager',
    });

    expect(result.assigneeName).toBe('Drita Gashi');
    expect(result.assigneeEmail).toBe('drita@example.com');
    expect(result.isDiasporaOrigin).toBe(false);
  });

  it('maps diaspora origin fields when the latest canonical note exists', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        claimNumber: 'KS-0001',
        companyName: 'Acme',
        title: 'Claim',
        status: 'verification',
        staffId: 'staff-2',
        assigneeName: 'Drita Gashi',
        assigneeEmail: 'drita@example.com',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        memberName: 'Member One',
        memberNumber: 'M-0001',
      },
    ]);
    mocks.historyChain.orderBy.mockResolvedValue([
      {
        claimId: 'claim-1',
        note: 'Started from Diaspora / Green Card quickstart. Country: IT. Incident location: abroad.',
      },
      {
        claimId: 'claim-1',
        note: 'Older note that should not replace the latest diaspora provenance.',
      },
    ]);

    const [result] = await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'branch_manager',
    });

    expect(result.isDiasporaOrigin).toBe(true);
    expect(result.diasporaCountry).toBe('IT');
  });

  it('limits the default staff queue to assigned-to-me and unassigned claims even when branchId exists', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      limit: 20,
      viewerRole: 'staff',
    });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ op: 'inArray' }),
          expect.objectContaining({ op: 'eq', left: 'claims.branch_id', right: 'branch-1' }),
          expect.objectContaining({
            op: 'or',
            conditions: expect.arrayContaining([
              expect.objectContaining({ op: 'eq', left: 'claims.staff_id', right: 'staff-1' }),
              expect.objectContaining({ op: 'isNull', column: 'claims.staff_id' }),
            ]),
          }),
        ]),
      })
    );
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

  it('includes own and unassigned claims when branchId is null', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-3',
      tenantId: 'tenant-ks',
      branchId: null,
      limit: 10,
    });

    expectOwnOrUnassignedQueueScope({ staffId: 'staff-3', tenantId: 'tenant-ks' });
  });

  it('applies assignment, status, and search filters within the actionable queue scope', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    await getStaffClaimsList({
      staffId: 'staff-3',
      tenantId: 'tenant-ks',
      branchId: null,
      limit: 10,
      assignment: 'unassigned',
      search: 'Acme',
      status: 'verification',
    });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.objectContaining({
        op: 'and',
        conditions: expect.arrayContaining([
          expect.objectContaining({ op: 'inArray' }),
          expect.objectContaining({ op: 'eq', left: 'claims.status', right: 'verification' }),
          expect.objectContaining({ op: 'isNull', column: 'claims.staff_id' }),
          expect.objectContaining({
            op: 'or',
            conditions: expect.arrayContaining([
              expect.objectContaining({ op: 'ilike', column: 'claims.title', value: '%Acme%' }),
              expect.objectContaining({
                op: 'ilike',
                column: 'claims.company_name',
                value: '%Acme%',
              }),
              expect.objectContaining({
                op: 'ilike',
                column: 'claims.claim_number',
                value: '%Acme%',
              }),
              expect.objectContaining({ op: 'ilike', column: 'user.name', value: '%Acme%' }),
              expect.objectContaining({
                op: 'ilike',
                column: 'user.member_number',
                value: '%Acme%',
              }),
            ]),
          }),
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
