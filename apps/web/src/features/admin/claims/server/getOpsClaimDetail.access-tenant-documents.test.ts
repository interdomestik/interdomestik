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
    createTenantSignedDownloadUrl: vi.fn(async () => ({ data: { signedUrl: 'signed' } })),
    mapClaimToOperationalRow: vi.fn(() => ({ id: 'claim-1', docs: [] })),
    withTenantContext: vi.fn(async (_ctx: unknown, action: (tx: unknown) => unknown) =>
      action({ query: { claims: { findFirst: claimsFindFirst } }, select: dbSelect })
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
vi.mock('@interdomestik/shared-auth', () => {
  const tenant = (session: {
    user?: { accessTenantId?: string | null; tenantId?: string | null };
  }) => session.user?.accessTenantId ?? session.user?.tenantId ?? 'tenant_access';
  return { ensureAccessTenantId: vi.fn(tenant), ensureTenantId: vi.fn(tenant) };
});
vi.mock('../mappers/mapClaimToOperationalRow', () => ({
  mapClaimToOperationalRow: h.mapClaimToOperationalRow,
}));
vi.mock('@interdomestik/database', () => {
  const cols = (p: string, keys: string[]) => Object.fromEntries(keys.map(k => [k, `${p}.${k}`]));
  const docCols = ['id', 'claimId', 'tenantId', 'name', 'filePath', 'bucket'];
  const historyCols = ['id', 'claimId', 'tenantId', 'note', 'createdAt'];
  return {
    withTenantContext: h.withTenantContext,
    and: h.and,
    eq: h.eq,
    desc: vi.fn((field: unknown) => `desc:${String(field)}`),
    claims: cols('claims', ['id', 'branchId']),
    claimDocuments: cols('claimDocuments', docCols),
    branches: cols('branches', ['id', 'tenantId', 'code', 'name']),
    claimStageHistory: cols('claimStageHistory', historyCols),
    user: cols('user', ['id', 'name', 'email', 'tenantId']),
  };
});
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
      staffId: 'staff-1',
      branchId: 'branch-1',
      createdAt: new Date('2026-02-22T00:00:00.000Z'),
    });
  });
  it('uses home-tenant dependent reads after access-tenant claim authorization', async () => {
    h.dbSelect
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
        queryFromRows([{ name: 'Member', email: 'm@example.test', memberNumber: 'MEM-1' }])
      )
      .mockImplementationOnce(() => queryFromRows([{ name: 'Agent Home' }]))
      .mockImplementationOnce(() =>
        queryFromRows([{ name: 'Staff Home', email: 'staff-home@example.test' }])
      )
      .mockImplementationOnce(() =>
        queryFromRows([{ id: 'branch-1', code: 'HOME-A', name: 'Home Branch' }])
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
    expect(h.withTenantContext.mock.calls.map(([ctx]) => ctx)).toEqual([
      expect.objectContaining({ tenantId: 'tenant_access' }),
      expect.objectContaining({ tenantId: 'tenant_home' }),
    ]);
    const eqCalls = h.eq.mock.calls.map(call => call.join(':'));
    expect(h.matchesAccessTenant).toHaveBeenCalledWith(expect.anything(), 'tenant_access');
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        'user.tenantId:tenant_home',
        'user.id:staff-1',
        'branches.tenantId:tenant_home',
        'claimStageHistory.tenantId:tenant_home',
      ])
    );
    expect(h.mapClaimToOperationalRow).toHaveBeenCalledWith(
      expect.objectContaining({
        claimant: expect.objectContaining({ email: 'm@example.test', memberNumber: 'MEM-1' }),
        agent: { name: 'Agent Home' },
        staff: { name: 'Staff Home', email: 'staff-home@example.test' },
        branch: { id: 'branch-1', code: 'HOME-A', name: 'Home Branch' },
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
