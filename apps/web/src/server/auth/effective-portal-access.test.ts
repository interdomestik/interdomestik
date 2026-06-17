import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  findTenant: vi.fn(),
  findUserRoles: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
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

describe('hasEffectivePortalAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUserRoles.mockResolvedValue([]);
    mocks.findTenant.mockResolvedValue(undefined);
  });

  it('denies cross-tenant access for non-super-admin even with elevated legacy role', async () => {
    const allowed = await hasEffectivePortalAccess(
      { user: { id: 'u1', tenantId: 'tenant_ks', role: 'admin' } },
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: 'tenant_mk' }
    );

    expect(allowed).toBe(false);
  });

  it('allows cross-tenant access only for legacy super_admin to active target tenant', async () => {
    mocks.findTenant.mockResolvedValueOnce({ id: 'tenant_mk' });

    const allowed = await hasEffectivePortalAccess(
      { user: { id: 'u1', tenantId: 'tenant_ks', role: 'super_admin' } },
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: 'tenant_mk' }
    );

    expect(allowed).toBe(true);
  });

  it('denies cross-tenant super_admin when requested tenant is not active/valid', async () => {
    const allowed = await hasEffectivePortalAccess(
      { user: { id: 'u1', tenantId: 'tenant_ks', role: 'super_admin' } },
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: 'tenant_mk' }
    );

    expect(allowed).toBe(false);
  });

  it('allows same-tenant legacy fallback when no tenant user_roles rows exist', async () => {
    const allowed = await hasEffectivePortalAccess(
      { user: { id: 'u1', tenantId: 'tenant_ks', role: 'admin' } },
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: 'tenant_ks' }
    );

    expect(allowed).toBe(true);
  });

  it('treats user_roles as authoritative when rows exist for requested tenant', async () => {
    mocks.findUserRoles.mockResolvedValueOnce([{ role: 'member' }]);

    const deniedByAuthoritativeRoles = await hasEffectivePortalAccess(
      { user: { id: 'u1', tenantId: 'tenant_ks', role: 'admin' } },
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: 'tenant_mk' }
    );

    expect(deniedByAuthoritativeRoles).toBe(false);
  });

  it('uses accessTenantId instead of legal-compatible tenantId for access checks', async () => {
    mocks.findUserRoles.mockImplementationOnce(async query => {
      query.where(
        { userId: 'user_id', tenantId: 'tenant_id' },
        { and: (...conditions: unknown[]) => conditions }
      );
      return [{ role: 'admin' }];
    });

    await expect(
      hasEffectivePortalAccess(
        {
          user: {
            id: 'admin-1',
            role: 'member',
            tenantId: 'tenant_legal_compat',
            accessTenantId: 'tenant_access',
          },
        },
        ['admin']
      )
    ).resolves.toBe(true);

    expect(mocks.findUserRoles).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith(expect.anything(), 'tenant_access');
    expect(mocks.eq).not.toHaveBeenCalledWith(expect.anything(), 'tenant_legal_compat');
  });
});
