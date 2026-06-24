import { afterEach, describe, expect, it } from 'vitest';

import { resolveTenantContextFromSources, resolveTenantIdFromSources } from './tenant-hosts';

describe('tenant-hosts public context', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalDefaultPublicTenantId = process.env.DEFAULT_PUBLIC_TENANT_ID;

  afterEach(() => {
    if (originalDefaultPublicTenantId === undefined) {
      delete mutableEnv.DEFAULT_PUBLIC_TENANT_ID;
      return;
    }
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = originalDefaultPublicTenantId;
  });

  it('returns public context instead of tenant for ida front-door hosts', () => {
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_ks';

    expect(
      resolveTenantContextFromSources({
        host: 'ida.localhost:3000',
        cookieTenantId: 'tenant_mk',
        headerTenantId: 'tenant_al',
        queryTenantId: 'pilot-mk',
      })
    ).toEqual({
      kind: 'public',
      tenantId: null,
      source: 'ida_front_door',
    });
  });

  it('keeps neutral fallback on the legacy default tenant path', () => {
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_ks';

    const sources = { host: 'example.test' };

    expect(resolveTenantContextFromSources(sources)).toEqual({
      kind: 'tenant',
      tenantId: 'tenant_ks',
      source: 'default_public',
    });
    expect(resolveTenantIdFromSources(sources)).toBe('tenant_ks');
  });

  it('keeps host alias compatibility as tenant context when other hints conflict', () => {
    expect(
      resolveTenantContextFromSources({
        host: 'ks.localhost:3000',
        cookieTenantId: 'tenant_mk',
        headerTenantId: 'tenant_mk',
        queryTenantId: 'tenant_mk',
      })
    ).toMatchObject({
      kind: 'tenant',
      tenantId: 'tenant_ks',
      source: 'compatibility_alias',
    });
  });
});
