import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('staff auth tolerant tenants flag', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to disabled when STAFF_AUTH_TOLERANT_TENANTS is blank', async () => {
    process.env.STAFF_AUTH_TOLERANT_TENANTS = '   ';

    const { getStaffAuthTolerantTenants, isStaffAuthTolerantTenant } =
      await import('./feature-flags');

    expect(Array.from(getStaffAuthTolerantTenants())).toEqual([]);
    expect(isStaffAuthTolerantTenant('tenant_ks')).toBe(false);
  });

  it('parses trimmed comma-separated tenant ids in lowercase', async () => {
    process.env.STAFF_AUTH_TOLERANT_TENANTS = ' tenant_ks, PILOT-MK , tenant_ks ';

    const { getStaffAuthTolerantTenants, isStaffAuthTolerantTenant } =
      await import('./feature-flags');

    expect(Array.from(getStaffAuthTolerantTenants()).sort()).toEqual(['pilot-mk', 'tenant_ks']);
    expect(isStaffAuthTolerantTenant('TENANT_KS')).toBe(true);
    expect(isStaffAuthTolerantTenant('pilot-mk')).toBe(true);
  });
});
