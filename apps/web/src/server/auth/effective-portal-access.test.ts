import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  findTenant: vi.fn(),
  findUserRoles: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  dbAdmin: {
    query: {
      tenants: {
        findFirst: (...args: unknown[]) => mocks.findTenant(...args),
      },
      userRoles: {
        findMany: (...args: unknown[]) => mocks.findUserRoles(...args),
      },
    },
  },
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: mocks.eq };
});

import { hasEffectivePortalAccess } from './effective-portal-access';

const adminRoles = ['admin', 'tenant_admin', 'super_admin'];

function session(role: string, tenantId = 'tenant_ks', accessTenantId?: string) {
  return { user: { id: 'u1', role, tenantId, accessTenantId } };
}

function mockTenantRole(role = 'admin') {
  mocks.findUserRoles.mockImplementationOnce(async query => {
    query.where(
      { userId: 'user_id', tenantId: 'tenant_id' },
      { and: (...parts: unknown[]) => parts }
    );
    return [{ role }];
  });
}

describe('hasEffectivePortalAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUserRoles.mockResolvedValue([]);
    mocks.findTenant.mockResolvedValue(undefined);
  });

  it.each([
    ['admin', undefined, false],
    ['super_admin', { id: 'tenant_mk' }, true],
    ['super_admin', undefined, false],
  ])(
    'resolves cross-tenant legacy %s access with active tenant %s',
    async (role, tenant, expected) => {
      if (tenant) mocks.findTenant.mockResolvedValueOnce(tenant);

      await expect(
        hasEffectivePortalAccess(session(role), adminRoles, { requestedTenantId: 'tenant_mk' })
      ).resolves.toBe(expected);
    }
  );

  it('allows same-tenant legacy fallback when no tenant user_roles rows exist', async () => {
    await expect(
      hasEffectivePortalAccess(session('admin'), adminRoles, { requestedTenantId: 'tenant_ks' })
    ).resolves.toBe(true);
  });

  it('treats user_roles as authoritative when rows exist for requested tenant', async () => {
    mocks.findUserRoles.mockResolvedValueOnce([{ role: 'member' }]);

    await expect(
      hasEffectivePortalAccess(session('admin'), adminRoles, { requestedTenantId: 'tenant_mk' })
    ).resolves.toBe(false);
  });

  it('uses accessTenantId instead of legal-compatible tenantId for access checks', async () => {
    mockTenantRole();

    await expect(
      hasEffectivePortalAccess(session('member', 'tenant_legal_compat', 'tenant_access'), ['admin'])
    ).resolves.toBe(true);

    expect(mocks.findUserRoles).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith(expect.anything(), 'tenant_access');
    expect(mocks.eq).not.toHaveBeenCalledWith(expect.anything(), 'tenant_legal_compat');
  });

  it('falls back to tenantId when accessTenantId is blank before role lookup', async () => {
    mockTenantRole();

    await expect(
      hasEffectivePortalAccess(session('member', 'tenant_ks', '   '), ['admin'])
    ).resolves.toBe(true);

    expect(mocks.eq).toHaveBeenCalledWith(expect.anything(), 'tenant_ks');
  });
});
