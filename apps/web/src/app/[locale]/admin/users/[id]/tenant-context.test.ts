import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAdminTenantContext } from './tenant-context';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    query: {
      tenants: {
        findFirst: (...args: unknown[]) => mocks.findFirst(...args),
      },
    },
  },
}));

describe('resolveAdminTenantContext', () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
  });

  it('returns session tenant for non-super-admin users', async () => {
    const tenantId = await resolveAdminTenantContext({
      session: { user: { role: 'tenant_admin', tenantId: 'tenant_ks' } },
      searchParams: { tenantId: 'tenant_mk' },
    });

    expect(tenantId).toBe('tenant_ks');
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('allows super_admin tenant switch only for active tenants', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'tenant_mk' });

    const tenantId = await resolveAdminTenantContext({
      session: { user: { role: 'super_admin', tenantId: 'tenant_ks' } },
      searchParams: { tenantId: 'tenant_mk' },
    });

    expect(tenantId).toBe('tenant_mk');
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it('falls back to session tenant when requested tenant is invalid', async () => {
    mocks.findFirst.mockResolvedValue(undefined);

    const tenantId = await resolveAdminTenantContext({
      session: { user: { role: 'super_admin', tenantId: 'tenant_ks' } },
      searchParams: { tenantId: 'invalid' },
    });

    expect(tenantId).toBe('tenant_ks');
  });
});
