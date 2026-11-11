import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailLinkOriginError, resolveTenantEmailOrigins } from './email-link-origins';
import {
  stubDeploymentOrigin,
  STAGING_DOOR,
  PRODUCTION_DOOR,
} from './deployment-origin.test-support';

const tenants = ['tenant_ks', 'tenant_mk', 'tenant_al', 'pilot-mk'] as const;

afterEach(() => vi.unstubAllEnvs());

describe('email destination origins', () => {
  it.each([
    ['production', PRODUCTION_DOOR],
    ['staging', STAGING_DOOR],
    ['local', 'http://ida.localhost:3310'],
    ['local', 'https://ida.127.0.0.1.nip.io:3443'],
  ])('uses the %s door for every known tenant', (environment, door) => {
    stubDeploymentOrigin(environment, door);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('KS_HOST', 'ks.alias.test');
    vi.stubEnv('MK_HOST', 'mk.alias.test');
    for (const tenant of tenants) {
      expect(resolveTenantEmailOrigins(tenant)).toEqual({ authOrigin: door, appOrigin: door });
    }
  });

  it('rejects unknown tenants before selecting a destination', () => {
    stubDeploymentOrigin();
    expect(() => resolveTenantEmailOrigins('unknown' as (typeof tenants)[number])).toThrowError(
      EmailLinkOriginError
    );
    try {
      resolveTenantEmailOrigins('unknown' as (typeof tenants)[number]);
    } catch (error) {
      expect((error as EmailLinkOriginError).reason).toBe('unknown_tenant');
    }
  });

  it('fails closed on missing, conflicting or production-leaking configuration', () => {
    for (const [key, value] of [
      ['BETTER_AUTH_URL', undefined],
      ['NEXT_PUBLIC_APP_URL', PRODUCTION_DOOR],
      ['IDA_HOST', undefined],
      ['KS_HOST', 'staging.interdomestik.com'],
      ['INTERDOMESTIK_BUILT_DEPLOY_ORIGIN', PRODUCTION_DOOR],
    ]) {
      stubDeploymentOrigin();
      vi.stubEnv(key!, value);
      expect(() => resolveTenantEmailOrigins('tenant_ks')).toThrow();
    }
  });
});
