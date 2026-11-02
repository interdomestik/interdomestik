import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  getActionContextMock: vi.fn(),
  scopeFilterMock: vi.fn(),
  resolveBranchOwnerMock: vi.fn(),
  readTenantCurrencyMock: vi.fn(),
  withTenantContextMock: vi.fn(),
  branchFindFirstMock: vi.fn(),
}));

vi.mock('@/actions/admin-users/context', () => ({
  getActionContext: hoisted.getActionContextMock,
}));
vi.mock('@/features/admin/branches/server/branch-cash-metrics', () => ({
  getBranchCashPendingByAgent: vi.fn(),
  getBranchCashPendingCount: vi.fn(),
}));
vi.mock('@interdomestik/database/db', () => ({ db: {} }));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: hoisted.withTenantContextMock,
}));
vi.mock('@interdomestik/database/platform-directory', () => ({
  resolveBranchOwner: hoisted.resolveBranchOwnerMock,
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
      hoisted.getActionContextMock.mockResolvedValue({
        session: {
          user: {
            role: 'branch_manager',
            branchId,
            tenantId: 'tenant-a',
          },
        },
      });

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
    hoisted.getActionContextMock.mockResolvedValue({ session: { user: { role, tenantId } } });
  }

  it.each([[null], [undefined]])(
    'returns null for a super_admin when the branch owner is unresolved (%j) and reads no tenant',
    async owner => {
      sessionAs('super_admin');
      hoisted.scopeFilterMock.mockReturnValue({ tenantId: null, isCrossTenantScope: true });
      hoisted.resolveBranchOwnerMock.mockResolvedValue(owner);

      await expect(getBranchDashboardV2Data('shared-code')).resolves.toBeNull();

      expect(hoisted.resolveBranchOwnerMock).toHaveBeenCalledWith('shared-code');
      expect(hoisted.withTenantContextMock).not.toHaveBeenCalled();
      expect(hoisted.readTenantCurrencyMock).not.toHaveBeenCalled();
    }
  );

  it('resolves the owner for a super_admin and reads the branch under that tenant', async () => {
    sessionAs('super_admin');
    hoisted.scopeFilterMock.mockReturnValue({ tenantId: null, isCrossTenantScope: true });
    hoisted.resolveBranchOwnerMock.mockResolvedValue({
      branchId: 'branch-id-1',
      tenantId: 'tenant-owner',
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
    expect(contexts.every(ctx => ctx.tenantId === 'tenant-owner')).toBe(true);
    expect(hoisted.readTenantCurrencyMock).toHaveBeenCalledWith('tenant-owner');

    const { where } = hoisted.branchFindFirstMock.mock.calls[0][0];
    const compiled = compile(where);
    expect(compiled.sql).toContain('"tenant_id"');
    expect(compiled.params).toEqual(['tenant-owner', 'b1', 'b1']);
  });

  it('never resolves a branch owner for a tenant-scoped role', async () => {
    sessionAs('tenant_admin');
    hoisted.scopeFilterMock.mockReturnValue({
      tenantId: 'tenant-session',
      isCrossTenantScope: false,
    });

    const data = await getBranchDashboardV2Data('b1');

    expect(data?.branch.id).toBe('branch-id-1');
    expect(hoisted.resolveBranchOwnerMock).not.toHaveBeenCalled();
    expect(hoisted.readTenantCurrencyMock).toHaveBeenCalledWith('tenant-session');
    const { where } = hoisted.branchFindFirstMock.mock.calls[0][0];
    expect(compile(where).params).toEqual(['tenant-session', 'b1', 'b1']);
    const contexts = hoisted.withTenantContextMock.mock.calls.map(call => call[0]);
    expect(contexts.every(ctx => ctx.tenantId === 'tenant-session')).toBe(true);
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
    expect(hoisted.resolveBranchOwnerMock).not.toHaveBeenCalled();
  });
});
