import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAdminTenantContext } from './tenant-context';

const mocks = vi.hoisted(() => ({
  readActiveTenantId: vi.fn(),
}));

vi.mock('@interdomestik/database/platform-directory', () => ({
  readActiveTenantId: (...args: unknown[]) => mocks.readActiveTenantId(...args),
}));

describe('resolveAdminTenantContext', () => {
  beforeEach(() => {
    mocks.readActiveTenantId.mockReset();
  });

  it('returns session tenant for non-super-admin users', async () => {
    const tenantId = await resolveAdminTenantContext({
      session: { user: { role: 'tenant_admin', tenantId: 'tenant_ks' } },
      searchParams: { tenantId: 'tenant_mk' },
    });

    expect(tenantId).toBe('tenant_ks');
    expect(mocks.readActiveTenantId).not.toHaveBeenCalled();
  });

  it('falls back to tenantId when accessTenantId is blank', async () => {
    const tenantId = await resolveAdminTenantContext({
      session: {
        user: { accessTenantId: ' ', role: 'tenant_admin', tenantId: 'tenant_ks' },
      },
      searchParams: { tenantId: 'tenant_mk' },
    });

    expect(tenantId).toBe('tenant_ks');
    expect(mocks.readActiveTenantId).not.toHaveBeenCalled();
  });

  it('allows super_admin tenant switch only for active tenants', async () => {
    mocks.readActiveTenantId.mockResolvedValue('tenant_mk');

    const tenantId = await resolveAdminTenantContext({
      session: { user: { role: 'super_admin', tenantId: 'tenant_ks' } },
      searchParams: { tenantId: 'tenant_mk' },
    });

    expect(tenantId).toBe('tenant_mk');
    expect(mocks.readActiveTenantId).toHaveBeenCalledTimes(1);
    expect(mocks.readActiveTenantId).toHaveBeenCalledWith('tenant_mk');
  });

  it('falls back to session tenant when requested tenant is invalid', async () => {
    mocks.readActiveTenantId.mockResolvedValue(null);

    const tenantId = await resolveAdminTenantContext({
      session: { user: { role: 'super_admin', tenantId: 'tenant_ks' } },
      searchParams: { tenantId: 'invalid' },
    });

    expect(tenantId).toBe('tenant_ks');
  });

  it('uses the session tenant without a lookup when super_admin requests no tenant', async () => {
    const tenantId = await resolveAdminTenantContext({
      session: { user: { role: 'super_admin', tenantId: 'tenant_ks' } },
      searchParams: {},
    });

    expect(tenantId).toBe('tenant_ks');
    expect(mocks.readActiveTenantId).not.toHaveBeenCalled();
  });
});
