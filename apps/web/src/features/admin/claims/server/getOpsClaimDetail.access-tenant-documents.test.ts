import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => {
  const dbSelect = vi.fn();
  const claimsFindFirst = vi.fn();
  return {
    dbSelect,
    claimsFindFirst,
    and: vi.fn((...args: unknown[]) => `and:${args.map(String).join('|')}`),
    eq: vi.fn((left: unknown, right: unknown) => `eq:${String(left)}:${String(right)}`),
    matchesAccessTenant: vi.fn((_table: unknown, tenantId: string) => `access:${tenantId}`),
    getSession: vi.fn(),
    headers: vi.fn(async () => new Headers([['host', 'ks.localhost:3000']])),
    createTenantSignedDownloadUrl: vi.fn(async () => ({
      data: { signedUrl: 'https://signed.example/doc' },
    })),
    mapClaimToOperationalRow: vi.fn(() => ({ id: 'claim-1', docs: [] })),
    withTenantContext: vi.fn(async (_ctx: unknown, action: (tx: unknown) => unknown) =>
      action({
        query: { claims: { findFirst: claimsFindFirst } },
        select: dbSelect,
      })
    ),
  };
});
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: h.getSession } } }));
vi.mock('next/headers', () => ({ headers: h.headers }));
vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveTenantFromHost: vi.fn(() => 'tenant_access'),
}));
vi.mock('@/lib/db/access-tenant-predicate', () => ({
  matchesAccessTenant: h.matchesAccessTenant,
}));
vi.mock('@/lib/storage/service-role', () => ({
  createTenantSignedDownloadUrl: h.createTenantSignedDownloadUrl,
}));
vi.mock('@interdomestik/shared-auth', () => ({
  ensureAccessTenantId: vi.fn(
    (session: { user?: { accessTenantId?: string | null; tenantId?: string | null } }) =>
      session.user?.accessTenantId ?? session.user?.tenantId ?? 'tenant_access'
  ),
  ensureTenantId: vi.fn(
    (session: { user?: { accessTenantId?: string | null; tenantId?: string | null } }) =>
      session.user?.accessTenantId ?? session.user?.tenantId ?? 'tenant_access'
  ),
}));
vi.mock('../mappers/mapClaimToOperationalRow', () => ({
  mapClaimToOperationalRow: h.mapClaimToOperationalRow,
}));
vi.mock('@interdomestik/database', () => ({
  withTenantContext: h.withTenantContext,
  and: h.and,
  eq: h.eq,
  desc: vi.fn((field: unknown) => `desc:${String(field)}`),
  claims: {
    id: 'claims.id',
    branchId: 'claims.branchId',
  },
  claimDocuments: {
    id: 'claimDocuments.id',
    claimId: 'claimDocuments.claimId',
    tenantId: 'claimDocuments.tenantId',
    name: 'claimDocuments.name',
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
  user: {
    id: 'user.id',
    name: 'user.name',
    email: 'user.email',
    tenantId: 'user.tenantId',
  },
}));
import { getOpsClaimDetail } from './getOpsClaimDetail';
function queryFromRows(rows: unknown[]) {
  const whereResult = Object.assign(Promise.resolve(rows), {
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue(rows) }),
  });
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(whereResult),
  };
}
describe('getOpsClaimDetail divergent document signing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getSession.mockResolvedValue({
      user: { id: 'admin-1', accessTenantId: 'tenant_access', role: 'admin' },
    });
    h.claimsFindFirst.mockResolvedValue({
      id: 'claim-1',
      tenantId: 'tenant_home',
      userId: 'member-1',
      agentId: 'agent-1',
      staff: null,
      branch: null,
      createdAt: new Date('2026-02-22T00:00:00.000Z'),
    });
  });
  it('uses home-tenant dependent reads after access-tenant claim authorization', async () => {
    h.dbSelect
      .mockImplementationOnce(() =>
        queryFromRows([{ name: 'Member', email: 'm@example.test', memberNumber: 'MEM-1' }])
      )
      .mockImplementationOnce(() => queryFromRows([{ name: 'Agent Home' }]))
      .mockImplementationOnce(() =>
        queryFromRows([
          {
            id: 'doc-1',
            tenantId: 'tenant_home',
            name: 'proof.pdf',
            filePath: 'pii/tenants/tenant_home/claims/claim-1/proof.pdf',
            bucket: 'claim-evidence',
          },
        ])
      )
      .mockImplementationOnce(() =>
        queryFromRows([
          {
            note: 'Started from Diaspora / Green Card quickstart. Country: IT. Incident location: abroad.',
          },
        ])
      );
    const result = await getOpsClaimDetail('claim-1');
    expect(result.kind).toBe('ok');
    expect(h.matchesAccessTenant).toHaveBeenCalledWith(expect.anything(), 'tenant_access');
    expect(h.eq).toHaveBeenCalledWith('user.tenantId', 'tenant_home');
    expect(h.eq).toHaveBeenCalledWith('claimStageHistory.tenantId', 'tenant_home');
    expect(h.mapClaimToOperationalRow).toHaveBeenCalledWith(
      expect.objectContaining({
        claimant: expect.objectContaining({ email: 'm@example.test', memberNumber: 'MEM-1' }),
        agent: { name: 'Agent Home' },
        claim: expect.objectContaining({ diasporaCountry: 'IT' }),
      })
    );
    expect(h.createTenantSignedDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'pii/tenants/tenant_home/claims/claim-1/proof.pdf',
        tenantId: 'tenant_home',
      })
    );
  });
});
