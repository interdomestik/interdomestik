import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const claimsFindFirst = vi.fn();
  const dbSelect = vi.fn();
  const eq = vi.fn((left: unknown, right: unknown) => `eq:${String(left)}:${String(right)}`);
  const and = vi.fn((...args: unknown[]) => `and:${args.map(String).join('|')}`);
  const getSession = vi.fn();
  const headersFn = vi.fn(async () => new Headers([['host', 'ks.localhost:3000']]));
  const ensureTenantId = vi.fn((session: { user?: { tenantId?: string | null } }) => {
    const tenantId = session?.user?.tenantId;
    if (!tenantId) throw new Error('Missing tenant');
    return tenantId;
  });
  const withTenantContext = vi.fn(async (_ctx: unknown, action: (tx: unknown) => unknown) =>
    action({
      query: {
        claims: {
          findFirst: claimsFindFirst,
        },
      },
      select: dbSelect,
    })
  );
  const mapClaimToOperationalRow = vi.fn(() => ({
    id: 'claim-1',
    memberName: 'Member One',
    memberEmail: 'member@example.com',
    memberNumber: 'MEM-1',
    branchCode: 'KS-A',
    claimAmount: null,
    status: 'submitted',
  }));

  return {
    claimsFindFirst,
    dbSelect,
    eq,
    and,
    getSession,
    headersFn,
    ensureTenantId,
    withTenantContext,
    mapClaimToOperationalRow,
  };
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersFn,
}));

vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveTenantFromHost: vi.fn((host: string) => {
    if (host.includes('ks.localhost')) return 'tenant_ks';
    if (host.includes('mk.localhost')) return 'tenant_mk';
    return null;
  }),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.mock('../mappers/mapClaimToOperationalRow', () => ({
  mapClaimToOperationalRow: hoisted.mapClaimToOperationalRow,
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
  and: hoisted.and,
  eq: hoisted.eq,
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenantId',
    title: 'claims.title',
    status: 'claims.status',
    createdAt: 'claims.createdAt',
    updatedAt: 'claims.updatedAt',
    assignedAt: 'claims.assignedAt',
    userId: 'claims.userId',
    claimNumber: 'claims.claimNumber',
    staffId: 'claims.staffId',
    category: 'claims.category',
    currency: 'claims.currency',
    statusUpdatedAt: 'claims.statusUpdatedAt',
    origin: 'claims.origin',
    originRefId: 'claims.originRefId',
    description: 'claims.description',
    companyName: 'claims.companyName',
    claimAmount: 'claims.claimAmount',
    agentId: 'claims.agentId',
  },
  claimDocuments: {
    id: 'claimDocuments.id',
    claimId: 'claimDocuments.claimId',
    tenantId: 'claimDocuments.tenantId',
    name: 'claimDocuments.name',
    fileSize: 'claimDocuments.fileSize',
    fileType: 'claimDocuments.fileType',
    createdAt: 'claimDocuments.createdAt',
    filePath: 'claimDocuments.filePath',
    bucket: 'claimDocuments.bucket',
  },
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
    tenantId: 'user.tenantId',
  },
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: vi.fn(),
      }),
    },
  }),
}));

import { getOpsClaimDetail } from './getOpsClaimDetail';

function createClaim() {
  const now = new Date('2026-02-22T00:00:00.000Z');
  return {
    id: 'claim-1',
    title: 'Test claim',
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
    assignedAt: null,
    userId: 'member-1',
    claimNumber: 'KS-000001',
    staffId: null,
    category: 'retail',
    currency: 'EUR',
    statusUpdatedAt: now,
    origin: 'portal',
    originRefId: null,
    description: 'Claim description',
    companyName: 'Company',
    claimAmount: null,
    agentId: null,
    staff: null,
    branch: {
      id: 'branch-1',
      code: 'KS-A',
      name: 'KS Branch A',
    },
  };
}

function mockSelectChains() {
  const userLimit = vi.fn().mockResolvedValue([
    {
      name: 'Member One',
      email: 'member@example.com',
      memberNumber: 'MEM-1',
    },
  ]);
  const userWhere = vi.fn().mockReturnValue({ limit: userLimit });
  const userQuery = {
    from: vi.fn().mockReturnThis(),
    where: userWhere,
  };

  const docsWhere = vi.fn().mockResolvedValue([]);
  const docsQuery = {
    from: vi.fn().mockReturnThis(),
    where: docsWhere,
  };

  hoisted.dbSelect.mockImplementationOnce(() => userQuery).mockImplementationOnce(() => docsQuery);

  return { docsWhere };
}

describe('getOpsClaimDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({
      user: {
        id: 'admin-1',
        tenantId: 'tenant_ks',
        role: 'admin',
      },
    });
    hoisted.claimsFindFirst.mockResolvedValue(createClaim());
    hoisted.withTenantContext.mockImplementation(
      async (_ctx: unknown, action: (tx: unknown) => unknown) =>
        action({
          query: {
            claims: {
              findFirst: hoisted.claimsFindFirst,
            },
          },
          select: hoisted.dbSelect,
        })
    );
  });

  it('returns not_found when host tenant and session tenant mismatch', async () => {
    hoisted.headersFn.mockResolvedValueOnce(new Headers([['host', 'mk.localhost:3000']]));

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns not_found when tenant context is missing from session', async () => {
    hoisted.ensureTenantId.mockImplementationOnce(() => {
      throw new Error('Missing tenant');
    });

    const result = await getOpsClaimDetail('claim-1');

    expect(result).toEqual({ kind: 'not_found' });
    expect(hoisted.claimsFindFirst).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('applies tenant predicate on claim document reads', async () => {
    const { docsWhere } = mockSelectChains();

    const result = await getOpsClaimDetail('claim-1');

    expect(result.kind).toBe('ok');
    expect(docsWhere).toHaveBeenCalledTimes(1);
    expect(String(docsWhere.mock.calls[0]?.[0] ?? '')).toContain(
      'eq:claimDocuments.tenantId:tenant_ks'
    );
  });

  it('executes reads under tenant context', async () => {
    mockSelectChains();

    await getOpsClaimDetail('claim-1');

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0]?.[0]).toMatchObject({
      tenantId: 'tenant_ks',
      role: 'admin',
    });
  });
});
