import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasEffectivePortalAccess } from './effective-portal-access';

const mocks = vi.hoisted(() => ({
  findUserRoles: vi.fn(),
  findTenant: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      userRoles: {
        findMany: (...args: unknown[]) => mocks.findUserRoles(...args),
      },
      tenants: {
        findFirst: (...args: unknown[]) => mocks.findTenant(...args),
      },
    },
  },
}));

describe('hasEffectivePortalAccess', () => {
  beforeEach(() => {
    mocks.findUserRoles.mockReset();
    mocks.findTenant.mockReset();
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
    mocks.findTenant.mockResolvedValueOnce(undefined);

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
});
