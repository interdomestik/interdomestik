import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  authorizeSessionTenantMock: vi.fn(),
  scopeFilterMock: vi.fn(),
  delegateBranchOwnerMock: vi.fn(),
  readTenantCurrencyMock: vi.fn(),
  withTenantContextMock: vi.fn(),
  branchFindFirstMock: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenantMock,
}));
vi.mock('@/features/admin/branches/server/branch-cash-metrics', () => ({
  getBranchCashPendingByAgent: vi.fn(),
  getBranchCashPendingCount: vi.fn(),
}));
vi.mock('@interdomestik/database/db', () => ({ db: {} }));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: hoisted.withTenantContextMock,
  delegateSuperAdminBranchOwner: hoisted.delegateBranchOwnerMock,
}));

vi.mock('@interdomestik/database/tenant-directory', () => ({
  readTenantCurrency: hoisted.readTenantCurrencyMock,
}));
vi.mock('@interdomestik/shared-auth', () => ({
  ROLES: { agent: 'agent', branch_manager: 'branch_manager' },
  scopeFilter: hoisted.scopeFilterMock,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
  withServerActionInstrumentation: vi.fn(
    async (_name: string, _options: unknown, action: () => Promise<unknown>) => action()
  ),
}));

import { PgDialect } from 'drizzle-orm/pg-core';
import { getBranchDashboardV2Data } from './getBranchDashboardV2Data';

function compile(where: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(where as Parameters<typeof dialect.sqlToQuery>[0]);
}

// What the session producer returns for a given role and tenant.
function authorizeAs(user: { role: string; tenantId: string; branchId?: unknown }) {
  const authority = mintTestTenantAuthority(user.tenantId, { userId: 'user-1', role: user.role });
  hoisted.authorizeSessionTenantMock.mockResolvedValue({ session: { user }, authority });
  return authority;
}

const tenantOf = (ctx: unknown) => readTenantAuthority(ctx as never).tenantId;

function makeTx() {
  const result = [{ count: 0 }];
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.groupBy = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return {
    select: () => chain,
    query: {
      branches: { findFirst: hoisted.branchFindFirstMock },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    },
  };
}

describe('getBranchDashboardV2Data branch-manager guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([undefined, null, '', '   ', 'branch-b'])(
    'returns null before database access for an unusable or mismatched assignment (%j)',
    async branchId => {
      authorizeAs({ role: 'branch_manager', branchId, tenantId: 'tenant-a' });

      await expect(getBranchDashboardV2Data('branch-a')).resolves.toBeNull();
      expect(hoisted.scopeFilterMock).not.toHaveBeenCalled();
      expect(hoisted.captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
        extra: { assignedBranchId: branchId?.trim(), branchId: 'branch-a' },
      });
    }
  );
});

describe('getBranchDashboardV2Data tenant scoping', () => {
  const branch = { id: 'branch-id-1', name: 'Branch One', code: 'b1', isActive: true };

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.withTenantContextMock.mockImplementation(
      async (_ctx: unknown, cb: (tx: unknown) => unknown) => cb(makeTx())
    );
    hoisted.branchFindFirstMock.mockResolvedValue(branch);
    hoisted.readTenantCurrencyMock.mockResolvedValue('MKD');
  });

  function sessionAs(role: string, tenantId = 'tenant-session') {
    return authorizeAs({ role, tenantId });
  }

  it.each([[null], [undefined]])(
    'returns null for a super_admin when the branch owner is unresolved (%j) and reads no tenant',
    async owner => {
      const sessionAuthority = sessionAs('super_admin');
      hoisted.scopeFilterMock.mockReturnValue({ tenantId: null, isCrossTenantScope: true });
      hoisted.delegateBranchOwnerMock.mockResolvedValue(owner);

      await expect(getBranchDashboardV2Data('shared-code')).resolves.toBeNull();

      expect(hoisted.delegateBranchOwnerMock).toHaveBeenCalledWith(sessionAuthority, 'shared-code');
      expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
      expect(hoisted.readTenantCurrencyMock).not.toHaveBeenCalled();
    }
  );

  it('resolves the owner for a super_admin and reads the branch under that tenant', async () => {
    const sessionAuthority = sessionAs('super_admin');
    hoisted.scopeFilterMock.mockReturnValue({ tenantId: null, isCrossTenantScope: true });
    const ownerAuthority = mintTestTenantAuthority('tenant-owner');
    hoisted.delegateBranchOwnerMock.mockResolvedValue({
      branchId: 'branch-id-1',
      tenantId: 'tenant-owner',
      authority: ownerAuthority,
    });

    const data = await getBranchDashboardV2Data('b1');

    expect(data?.branch).toEqual({
      id: 'branch-id-1',
      name: 'Branch One',
      code: 'b1',
      isActive: true,
      currency: 'MKD',
    });
    const contexts = hoisted.withTenantContextMock.mock.calls.map(call => call[0]);
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts.every(ctx => ctx === ownerAuthority)).toBe(true);
    expect(hoisted.delegateBranchOwnerMock).toHaveBeenCalledWith(sessionAuthority, 'b1');
    expect(hoisted.readTenantCurrencyMock).toHaveBeenCalledWith('tenant-owner');

    const { where } = hoisted.branchFindFirstMock.mock.calls[0][0];
    const compiled = compile(where);
    expect(compiled.sql).toContain('"tenant_id"');
    // The resolved owner binds the exact branch row: tenant plus id, no id-or-code match.
    expect(compiled.sql).not.toContain(' or ');
    expect(compiled.sql).not.toContain('"code"');
    expect(compiled.params).toEqual(['tenant-owner', 'branch-id-1']);
  });

  it('never resolves a branch owner for a tenant-scoped role', async () => {
    const sessionAuthority = sessionAs('tenant_admin');
    hoisted.scopeFilterMock.mockReturnValue({
      tenantId: 'tenant-session',
      isCrossTenantScope: false,
    });

    const data = await getBranchDashboardV2Data('b1');

    expect(data?.branch.id).toBe('branch-id-1');
    expect(hoisted.delegateBranchOwnerMock).not.toHaveBeenCalled();
    expect(hoisted.readTenantCurrencyMock).toHaveBeenCalledWith('tenant-session');
    const { where } = hoisted.branchFindFirstMock.mock.calls[0][0];
    const compiled = compile(where);
    // Tenant scopes still match id or code inside the session tenant.
    expect(compiled.sql).toContain(' or ');
    expect(compiled.sql).toContain('"code"');
    expect(compiled.params).toEqual(['tenant-session', 'b1', 'b1']);
    const contexts = hoisted.withTenantContextMock.mock.calls.map(call => call[0]);
    expect(contexts.every(ctx => ctx === sessionAuthority)).toBe(true);
    expect(contexts.every(ctx => tenantOf(ctx) === 'tenant-session')).toBe(true);
  });

  it('returns null when the branch is not found inside the tenant context', async () => {
    sessionAs('tenant_admin');
    hoisted.scopeFilterMock.mockReturnValue({
      tenantId: 'tenant-session',
      isCrossTenantScope: false,
    });
    hoisted.branchFindFirstMock.mockResolvedValue(undefined);

    await expect(getBranchDashboardV2Data('b-other-tenant')).resolves.toBeNull();
    expect(hoisted.readTenantCurrencyMock).not.toHaveBeenCalled();
  });

  it('falls back to EUR when the tenant currency is unavailable', async () => {
    sessionAs('tenant_admin');
    hoisted.scopeFilterMock.mockReturnValue({
      tenantId: 'tenant-session',
      isCrossTenantScope: false,
    });
    hoisted.readTenantCurrencyMock.mockResolvedValue(null);

    const data = await getBranchDashboardV2Data('b1');

    expect(data?.branch.currency).toBe('EUR');
  });

  it('returns null without reading a branch when a tenant-scoped session has no tenant', async () => {
    sessionAs('tenant_admin');
    hoisted.scopeFilterMock.mockReturnValue({ tenantId: null, isCrossTenantScope: false });

    await expect(getBranchDashboardV2Data('b1')).resolves.toBeNull();
    expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
    expect(hoisted.delegateBranchOwnerMock).not.toHaveBeenCalled();
  });

  it('fails closed when the role scope names a tenant other than the session authority', async () => {
    sessionAs('tenant_admin', 'tenant-session');
    hoisted.scopeFilterMock.mockReturnValue({
      tenantId: 'tenant-other',
      isCrossTenantScope: false,
    });

    await expect(getBranchDashboardV2Data('b1')).resolves.toBeNull();
    expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
  });

  it('returns null for an unauthenticated request before any tenant read', async () => {
    hoisted.authorizeSessionTenantMock.mockResolvedValue(null);

    await expect(getBranchDashboardV2Data('b1')).resolves.toBeNull();
    expect(hoisted.scopeFilterMock).not.toHaveBeenCalled();
    expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
  });
});
