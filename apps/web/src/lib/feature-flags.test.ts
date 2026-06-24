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

    expect(
      Array.from(getStaffAuthTolerantTenants()).sort((left, right) => left.localeCompare(right))
    ).toEqual(['pilot-mk', 'tenant_ks']);
    expect(isStaffAuthTolerantTenant('TENANT_KS')).toBe(true);
    expect(isStaffAuthTolerantTenant('pilot-mk')).toBe(true);
  });
});

describe('ida live login cutover flag', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to disabled', async () => {
    delete process.env.FEATURE_IDA_LIVE_LOGIN_CUTOVER;

    const { isIdaLiveLoginCutoverEnabled } = await import('./feature-flags');

    expect(isIdaLiveLoginCutoverEnabled()).toBe(false);
  });

  it('enables only on explicit true', async () => {
    process.env.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';

    const { isIdaLiveLoginCutoverEnabled } = await import('./feature-flags');

    expect(isIdaLiveLoginCutoverEnabled()).toBe(true);
  });
});
