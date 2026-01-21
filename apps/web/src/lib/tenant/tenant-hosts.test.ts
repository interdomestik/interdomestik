import { afterEach, describe, expect, it } from 'vitest';

import { coerceTenantId, isTenantHost, resolveTenantFromHost, type TenantId } from './tenant-hosts';

describe('tenant-hosts', () => {
  const originalKsHost = process.env.KS_HOST;
  const originalMkHost = process.env.MK_HOST;

  afterEach(() => {
    process.env.KS_HOST = originalKsHost;
    process.env.MK_HOST = originalMkHost;
  });

  it('resolves canonical local hosts', () => {
    expect(resolveTenantFromHost('ks.localhost')).toBe('tenant_ks');
    expect(resolveTenantFromHost('mk.localhost')).toBe('tenant_mk');
  });

  it('handles ports, casing, and trailing dot', () => {
    expect(resolveTenantFromHost('KS.LOCALHOST:3000')).toBe('tenant_ks');
    expect(resolveTenantFromHost('mk.localhost:3000')).toBe('tenant_mk');
    expect(resolveTenantFromHost('mk.localhost.')).toBe('tenant_mk');
  });

  it('supports env host overrides (with or without port)', () => {
    process.env.KS_HOST = 'ks.dev.example:1234';

    expect(resolveTenantFromHost('ks.dev.example')).toBe('tenant_ks');
    expect(resolveTenantFromHost('ks.dev.example:1234')).toBe('tenant_ks');
  });

  it('returns null for unknown hosts', () => {
    expect(resolveTenantFromHost('localhost')).toBeNull();
    expect(resolveTenantFromHost('example.com')).toBeNull();
  });

  it('coerces tenantId values safely', () => {
    expect(coerceTenantId('tenant_ks')).toBe('tenant_ks');
    expect(coerceTenantId('tenant_mk')).toBe('tenant_mk');
    expect(coerceTenantId('tenant_nope')).toBeNull();
    expect(coerceTenantId(null)).toBeNull();
  });

  it('detects tenant hosts', () => {
    const ks: TenantId = 'tenant_ks';
    expect(isTenantHost('ks.localhost')).toBe(true);
    expect(isTenantHost('mk.localhost')).toBe(true);
    expect(isTenantHost('localhost')).toBe(false);
    expect(ks).toBe('tenant_ks');
  });
});
