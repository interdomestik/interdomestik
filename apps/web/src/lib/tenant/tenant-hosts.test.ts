import { afterEach, describe, expect, it } from 'vitest';

import {
  coerceTenantId,
  isTenantHost,
  resolveTenantFromHost,
  resolveTenantIdFromSources,
  type TenantId,
} from './tenant-hosts';

describe('tenant-hosts', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalKsHost = process.env.KS_HOST;
  const originalMkHost = process.env.MK_HOST;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    mutableEnv.KS_HOST = originalKsHost;
    mutableEnv.MK_HOST = originalMkHost;
    mutableEnv.NODE_ENV = originalNodeEnv;
    mutableEnv.VERCEL_ENV = originalVercelEnv;
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
    mutableEnv.KS_HOST = 'ks.dev.example:1234';

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

  it('uses host as canonical source when other tenant hints conflict', () => {
    expect(
      resolveTenantIdFromSources({
        host: 'ks.localhost:3000',
        cookieTenantId: 'tenant_mk',
        headerTenantId: 'tenant_mk',
        queryTenantId: 'tenant_mk',
      })
    ).toBe('tenant_ks');
  });

  it('uses cookie/header fallback in production-sensitive mode when host is neutral', () => {
    mutableEnv.NODE_ENV = 'production';
    delete mutableEnv.VERCEL_ENV;

    expect(
      resolveTenantIdFromSources(
        {
          host: 'localhost:3000',
          cookieTenantId: 'tenant_mk',
          headerTenantId: 'tenant_mk',
          queryTenantId: 'tenant_mk',
        },
        { productionSensitive: true }
      )
    ).toBe('tenant_mk');
  });

  it('blocks query-only fallback in production-sensitive mode', () => {
    mutableEnv.NODE_ENV = 'production';
    delete mutableEnv.VERCEL_ENV;

    expect(
      resolveTenantIdFromSources(
        {
          host: 'localhost:3000',
          queryTenantId: 'tenant_mk',
        },
        { productionSensitive: true }
      )
    ).toBeNull();
  });

  it('retains query fallback behavior in non-production environments', () => {
    mutableEnv.NODE_ENV = 'test';
    delete mutableEnv.VERCEL_ENV;

    expect(
      resolveTenantIdFromSources(
        {
          host: 'localhost:3000',
          queryTenantId: 'tenant_mk',
        },
        { productionSensitive: true }
      )
    ).toBe('tenant_mk');
  });
});
