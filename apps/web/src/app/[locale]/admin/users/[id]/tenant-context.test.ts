import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAdminTenantAuthority } from './tenant-context';

const mocks = vi.hoisted(() => ({
  delegateSuperAdminTenant: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  delegateSuperAdminTenant: (...args: unknown[]) => mocks.delegateSuperAdminTenant(...args),
}));

describe('resolveAdminTenantAuthority', () => {
  beforeEach(() => {
    mocks.delegateSuperAdminTenant.mockReset();
  });

  it('keeps the session authority for non-super-admin users and ignores a requested tenant', async () => {
    const authority = mintTestTenantAuthority('tenant_ks');

    await expect(
      resolveAdminTenantAuthority({
        authority,
        role: 'tenant_admin',
        searchParams: { tenantId: 'tenant_mk' },
      })
    ).resolves.toBe(authority);
    expect(mocks.delegateSuperAdminTenant).not.toHaveBeenCalled();
  });

  it('reads nothing without a session authority, even for a super_admin', async () => {
    await expect(
      resolveAdminTenantAuthority({
        authority: null,
        role: 'super_admin',
        searchParams: { tenantId: 'tenant_mk' },
      })
    ).resolves.toBeNull();
    expect(mocks.delegateSuperAdminTenant).not.toHaveBeenCalled();
  });

  it('delegates a super_admin tenant switch to an active tenant', async () => {
    const authority = mintTestTenantAuthority('tenant_ks');
    const delegated = mintTestTenantAuthority('tenant_mk');
    mocks.delegateSuperAdminTenant.mockResolvedValue(delegated);

    await expect(
      resolveAdminTenantAuthority({
        authority,
        role: 'super_admin',
        searchParams: { tenantId: ' tenant_mk ' },
      })
    ).resolves.toBe(delegated);
    expect(mocks.delegateSuperAdminTenant).toHaveBeenCalledTimes(1);
    expect(mocks.delegateSuperAdminTenant.mock.calls[0]?.[0]).toBe(authority);
    expect(mocks.delegateSuperAdminTenant.mock.calls[0]?.[1]).toBe('tenant_mk');
  });

  it('falls back to the session authority when the requested tenant is unknown or inactive', async () => {
    const authority = mintTestTenantAuthority('tenant_ks');
    mocks.delegateSuperAdminTenant.mockResolvedValue(null);

    await expect(
      resolveAdminTenantAuthority({
        authority,
        role: 'super_admin',
        searchParams: { tenantId: 'invalid' },
      })
    ).resolves.toBe(authority);
  });

  it('uses the session authority without a delegation when a super_admin requests no tenant', async () => {
    const authority = mintTestTenantAuthority('tenant_ks');

    await expect(
      resolveAdminTenantAuthority({ authority, role: 'super_admin', searchParams: {} })
    ).resolves.toBe(authority);
    expect(mocks.delegateSuperAdminTenant).not.toHaveBeenCalled();
  });
});
