import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const mainQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn(),
  };

  const countQuery = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };

  const historyQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn(),
  };
  return {
    dbSelect: vi.fn(),
    mapClaimsToOperationalRows: vi.fn(),
    getAdminClaimStats: vi.fn(),
    buildDiasporaOriginClaimIdsSubquery: vi.fn(),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    eq: vi.fn((a: unknown, b: unknown) => `eq:${String(a)}:${String(b)}`),
    desc: vi.fn((field: unknown) => `desc:${String(field)}`),
    or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
    ilike: vi.fn((field: unknown, pattern: unknown) => `ilike:${String(field)}:${String(pattern)}`),
    inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
    count: vi.fn(() => 'count(*)'),
    aliasedTable: vi.fn((_table: unknown, alias: string) => ({ __alias: alias })),
    mainQuery,
    countQuery,
    historyQuery,
  };
});

vi.mock('@interdomestik/database', () => ({
  db: {
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenantId',
    userId: 'claims.userId',
    staffId: 'claims.staffId',
    branchId: 'claims.branchId',
    title: 'claims.title',
    status: 'claims.status',
    createdAt: 'claims.createdAt',
    updatedAt: 'claims.updatedAt',
    assignedAt: 'claims.assignedAt',
    category: 'claims.category',
    currency: 'claims.currency',
    claimNumber: 'claims.claimNumber',
    origin: 'claims.origin',
    originRefId: 'claims.originRefId',
    statusUpdatedAt: 'claims.statusUpdatedAt',
  },
  claimStageHistory: {
    claimId: 'claimStageHistory.claimId',
    tenantId: 'claimStageHistory.tenantId',
    note: 'claimStageHistory.note',
    createdAt: 'claimStageHistory.createdAt',
    id: 'claimStageHistory.id',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
  },
  branches: {
    id: 'branches.id',
    code: 'branches.code',
    name: 'branches.name',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  desc: hoisted.desc,
  or: hoisted.or,
  ilike: hoisted.ilike,
  inArray: hoisted.inArray,
  count: hoisted.count,
  aliasedTable: hoisted.aliasedTable,
}));

vi.mock('../mappers', () => ({
  mapClaimsToOperationalRows: hoisted.mapClaimsToOperationalRows,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  parseDiasporaOriginFromPublicNote: (note: string | null | undefined) =>
    note?.includes('Started from Diaspora / Green Card quickstart.')
      ? { source: 'diaspora-green-card', country: note.includes('Country: DE') ? 'DE' : null }
      : null,
  buildDiasporaOriginClaimIdsSubquery: hoisted.buildDiasporaOriginClaimIdsSubquery,
}));

vi.mock('./getAdminClaimStats', () => ({
  getAdminClaimStats: hoisted.getAdminClaimStats,
}));

import { getAdminClaimsV2 } from './getAdminClaimsV2';

const DIASPORA_NOTE_DE =
  'Started from Diaspora / Green Card quickstart. Country: DE. Incident location: abroad.';

function mockQueryResults(rawRows: unknown[], totalCount: number) {
  hoisted.mainQuery.offset.mockResolvedValue(rawRows);
  hoisted.historyQuery.orderBy.mockResolvedValue([]);
  hoisted.countQuery.where.mockResolvedValue([{ totalCount }]);
  hoisted.dbSelect
    .mockImplementationOnce(() => hoisted.mainQuery)
    .mockImplementationOnce(() => hoisted.historyQuery)
    .mockImplementationOnce(() => hoisted.countQuery);
}

function createAdminRawRow(args: {
  id: string;
  claimNumber: string;
  userId: string;
  title: string;
  claimantName: string;
  claimantEmail: string;
}) {
  return {
    claim: {
      id: args.id,
      claimNumber: args.claimNumber,
      userId: args.userId,
      title: args.title,
      status: 'submitted',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
      assignedAt: null,
      category: null,
      currency: null,
      origin: 'portal',
      originRefId: null,
      statusUpdatedAt: null,
    },
    claimant: { name: args.claimantName, email: args.claimantEmail },
    staff: { name: null, email: null },
    branch: { id: 'branch-1', code: 'KS', name: 'Kosovo' },
  };
}

describe('getAdminClaimsV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mapClaimsToOperationalRows.mockReturnValue([]);
    hoisted.getAdminClaimStats.mockResolvedValue({
      intake: 0,
      verification: 0,
      processing: 0,
      negotiation: 0,
      legal: 0,
      completed: 0,
    });
    hoisted.buildDiasporaOriginClaimIdsSubquery.mockReturnValue('diaspora-subquery');
  });

  it('applies tenant predicate at query boundary for list reads', async () => {
    mockQueryResults([], 0);

    await getAdminClaimsV2({
      tenantId: 'tenant-A',
      userId: 'u1',
      role: 'admin',
      branchId: null,
    });

    const andCallArgs = hoisted.and.mock.calls[0] ?? [];
    expect(andCallArgs).toContain('eq:claims.tenantId:tenant-A');
  });

  it('uses deterministic ordering: updatedAt desc then id desc', async () => {
    mockQueryResults([{ claim: { id: 'claim-1' } }], 1);

    await getAdminClaimsV2({
      tenantId: 'tenant-A',
      userId: 'u1',
      role: 'admin',
      branchId: null,
    });

    expect(hoisted.desc).toHaveBeenCalledWith('claims.updatedAt');
    expect(hoisted.desc).toHaveBeenCalledWith('claims.id');
  });

  it('returns deterministic results for same filters', async () => {
    const mappedRows = [{ id: 'c2' }, { id: 'c1' }];
    hoisted.mapClaimsToOperationalRows.mockReturnValue(mappedRows);

    mockQueryResults([{ claim: { id: 'raw-1' } }], 2);
    const first = await getAdminClaimsV2(
      { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
      { lifecycleStage: 'intake', search: 'alpha', page: 1 }
    );

    const firstOrderByArgs = hoisted.mainQuery.orderBy.mock.calls[0];

    mockQueryResults([{ claim: { id: 'raw-1' } }], 2);
    const second = await getAdminClaimsV2(
      { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
      { lifecycleStage: 'intake', search: 'alpha', page: 1 }
    );

    const secondOrderByArgs = hoisted.mainQuery.orderBy.mock.calls[1];

    expect(first.rows).toEqual(second.rows);
    expect(first.pagination).toEqual(second.pagination);
    expect(firstOrderByArgs).toEqual(secondOrderByArgs);
  });

  it('forwards diaspora provenance into the operational mapper input when history carries the canonical note', async () => {
    hoisted.mainQuery.offset.mockResolvedValue([
      {
        claim: { id: 'claim-1' },
      },
    ]);
    hoisted.historyQuery.orderBy.mockResolvedValue([
      {
        claimId: 'claim-1',
        note: DIASPORA_NOTE_DE,
      },
    ]);
    hoisted.countQuery.where.mockResolvedValue([{ totalCount: 1 }]);
    hoisted.dbSelect
      .mockImplementationOnce(() => hoisted.mainQuery)
      .mockImplementationOnce(() => hoisted.historyQuery)
      .mockImplementationOnce(() => hoisted.countQuery);

    await getAdminClaimsV2({
      tenantId: 'tenant-A',
      userId: 'u1',
      role: 'admin',
      branchId: null,
    });

    expect(hoisted.mapClaimsToOperationalRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          claim: expect.objectContaining({
            diasporaCountry: 'DE',
          }),
        }),
      ])
    );
  });

  it('handles unknown filter values safely as fail-closed no-op', async () => {
    mockQueryResults([], 0);

    await expect(
      getAdminClaimsV2(
        { tenantId: 'tenant-A', userId: 'u1', role: 'admin', branchId: null },
        { lifecycleStage: 'not-a-real-stage' as never, status: '__bad__', assigned: '__bad__' }
      )
    ).resolves.not.toThrow();

    const andCallArgs = hoisted.and.mock.calls[0] ?? [];
    expect(andCallArgs).toEqual(['eq:claims.tenantId:tenant-A']);
    expect(hoisted.inArray).not.toHaveBeenCalled();
  });

  it('applies a shared diaspora-origin subquery when the diaspora filter is selected', async () => {
    hoisted.mainQuery.offset.mockResolvedValue([
      createAdminRawRow({
        id: 'claim-1',
        claimNumber: 'KS-0001',
        userId: 'member-1',
        title: 'Diaspora claim',
        claimantName: 'Member One',
        claimantEmail: 'member1@example.com',
      }),
      createAdminRawRow({
        id: 'claim-2',
        claimNumber: 'KS-0002',
        userId: 'member-2',
        title: 'Non diaspora claim',
        claimantName: 'Member Two',
        claimantEmail: 'member2@example.com',
      }),
    ]);
    hoisted.historyQuery.orderBy.mockResolvedValue([
      {
        claimId: 'claim-1',
        note: DIASPORA_NOTE_DE,
      },
    ]);
    hoisted.countQuery.where.mockResolvedValue([{ totalCount: 1 }]);
    hoisted.mapClaimsToOperationalRows.mockImplementation(rows =>
      rows.map((row: any) => ({
        id: row.claim.id,
        diasporaCountry: row.claim.diasporaCountry ?? null,
      }))
    );
    hoisted.dbSelect
      .mockImplementationOnce(() => hoisted.mainQuery)
      .mockImplementationOnce(() => hoisted.historyQuery)
      .mockImplementationOnce(() => hoisted.countQuery);

    await getAdminClaimsV2(
      {
        tenantId: 'tenant-A',
        userId: 'u1',
        role: 'admin',
        branchId: null,
      },
      { diasporaOrigin: 'diaspora' as any }
    );

    expect(hoisted.buildDiasporaOriginClaimIdsSubquery).toHaveBeenCalledWith('tenant-A');
    expect(hoisted.inArray).toHaveBeenCalledWith('claims.id', 'diaspora-subquery');
  });
});
