import { afterEach, describe, expect, it } from 'vitest';

import {
  canonicalHostForTenant,
  envHostForTenant,
  localHostForTenant,
  resolveCountryHostCompatibilityAlias,
} from './tenant-host-aliases';
import { resolveTenantContextFromSources } from './tenant-hosts';

describe('tenant host compatibility aliases', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalKsHost = process.env.KS_HOST;

  afterEach(() => {
    mutableEnv.KS_HOST = originalKsHost;
  });

  it.each([
    ['ks.localhost:3000', 'tenant_ks', 'ks'],
    ['mk.localhost:3000', 'tenant_mk', 'mk'],
    ['al.localhost:3000', 'tenant_al', 'al'],
    ['ks.interdomestik.com', 'tenant_ks', 'ks'],
    ['mk.interdomestik.com', 'tenant_mk', 'mk'],
    ['al.interdomestik.com', 'tenant_al', 'al'],
    ['pilot.interdomestik.com', 'pilot-mk', 'pilot'],
    ['ks.10.0.2.15.nip.io', 'tenant_ks', 'ks'],
    ['pilot.127.0.0.1.nip.io', 'pilot-mk', 'pilot'],
  ] as const)(
    'classifies %s as a compatibility alias with default booking hint',
    (host, tenantId, label) => {
      expect(resolveCountryHostCompatibilityAlias(host)).toEqual({
        kind: 'country_host_compatibility_alias',
        label,
        tenantId,
        defaultBookingTenantId: tenantId,
      });
    }
  );

  it('rejects unconfigured lookalike hosts', () => {
    expect(resolveCountryHostCompatibilityAlias('ks.attacker.test')).toBeNull();
    expect(resolveCountryHostCompatibilityAlias('mk-evil.localhost')).toBeNull();
    expect(resolveCountryHostCompatibilityAlias('ks.999.0.0.1.nip.io')).toBeNull();
    expect(resolveCountryHostCompatibilityAlias('example.test')).toBeNull();
  });

  it('exposes preferred hosts without cross-tenant fallback', () => {
    mutableEnv.KS_HOST = 'ks.dev.example:1234';

    expect(canonicalHostForTenant('tenant_ks')).toBe('ks.interdomestik.com');
    expect(localHostForTenant('tenant_mk')).toBe('mk.localhost');
    expect(envHostForTenant('tenant_ks')).toBe('ks.dev.example:1234');
  });

  it('keeps alias compatibility while marking host context as non-authoritative', () => {
    expect(
      resolveTenantContextFromSources({
        host: 'ks.localhost:3000',
        cookieTenantId: 'tenant_mk',
        headerTenantId: 'tenant_mk',
        queryTenantId: 'tenant_mk',
      })
    ).toEqual({
      tenantId: 'tenant_ks',
      source: 'compatibility_alias',
      defaultBookingTenantId: 'tenant_ks',
      hostAlias: 'ks',
    });
  });
});
