import { vi } from 'vitest';
const hoisted = vi.hoisted(() => {
  const claimsFindFirst = vi.fn();
  const dbSelect = vi.fn();
  const eq = vi.fn((left: unknown, right: unknown) => `eq:${String(left)}:${String(right)}`);
  const and = vi.fn((...args: unknown[]) => `and:${args.map(String).join('|')}`);
  const getSession = vi.fn();
  const headersFn = vi.fn(() => Promise.resolve(new Headers([['host', 'ks.localhost:3000']])));
  const ensureTenantId = vi.fn(
    (session: { user?: { accessTenantId?: string | null; tenantId?: string | null } }) => {
      const tenantId = session?.user?.accessTenantId?.trim() || session?.user?.tenantId;
      if (!tenantId) throw new Error('Missing tenant');
      return tenantId;
    }
  );
  const withTenantContext = vi.fn(
    async (_ctx: unknown, action: (tx: unknown) => unknown) =>
      await action({
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
    isDiasporaOrigin: false,
    diasporaCountry: null,
  }));
  return {
    claimsFindFirst,
    dbSelect,
    eq,
    and,
    matchesAccessTenant: vi.fn((_table: unknown, tenantId: string) => `access:${tenantId}`),
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
  ensureAccessTenantId: hoisted.ensureTenantId,
  ensureTenantId: hoisted.ensureTenantId,
}));
vi.mock('@/lib/db/access-tenant-predicate', () => ({
  matchesAccessTenant: hoisted.matchesAccessTenant,
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
    branchId: 'claims.branchId',
    title: 'claims.title',
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
  claimStageHistory: {
    id: 'claimStageHistory.id',
    claimId: 'claimStageHistory.claimId',
    tenantId: 'claimStageHistory.tenantId',
    note: 'claimStageHistory.note',
    createdAt: 'claimStageHistory.createdAt',
  },
  desc: vi.fn((field: unknown) => `desc:${String(field)}`),
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

export function createClaim() {
  const now = new Date('2026-02-22T00:00:00.000Z');
  return {
    id: 'claim-1',
    tenantId: 'tenant_home',
    title: 'Test claim',
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
    caseLifecycleState: 'submitted',
    agentId: null,
    recoveryLifecycleState: 'not_started',
    staff: null,
    branch: {
      id: 'branch-1',
      code: 'KS-A',
      name: 'KS Branch A',
    },
  };
}

export function mockSelectChains() {
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

  const noteLimit = vi.fn().mockResolvedValue([]);
  const noteOrderBy = vi.fn().mockReturnValue({ limit: noteLimit });
  const noteWhere = vi.fn().mockReturnValue({ orderBy: noteOrderBy });
  const noteQuery = {
    from: vi.fn().mockReturnThis(),
    where: noteWhere,
  };

  hoisted.dbSelect
    .mockImplementationOnce(() => docsQuery)
    .mockImplementationOnce(() => userQuery)
    .mockImplementationOnce(() => noteQuery);

  return { docsWhere, noteWhere };
}

export function resetOpsClaimDetailMocks(): void {
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
      await action({
        query: {
          claims: {
            findFirst: hoisted.claimsFindFirst,
          },
        },
        select: hoisted.dbSelect,
      })
  );
}

// Exported separately: Vitest rejects exporting a vi.hoisted declaration directly.
export { hoisted };
