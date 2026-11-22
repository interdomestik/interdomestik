import { describe, expect, it } from 'vitest';
import { resolvePublicAdmissionTenant } from './public-admission-tenant';

const production = {
  INTERDOMESTIK_DEPLOY_ENV: 'production',
  DEFAULT_PUBLIC_TENANT_ID: 'tenant_mk',
};
const staging = { VERCEL: '1', VERCEL_ENV: 'preview', DEFAULT_PUBLIC_TENANT_ID: 'pilot-mk' };
const development = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://fixture@localhost:5432/test',
  DATABASE_URL_RLS: 'postgres://fixture@localhost:5432/test',
  DEFAULT_PUBLIC_TENANT_ID: 'tenant_al',
};

describe('resolvePublicAdmissionTenant', () => {
  it.each([
    [production, 'ida.interdomestik.com', 'tenant_mk'],
    [production, 'ks.interdomestik.com', null],
    [production, 'staging.interdomestik.com', null],
    [production, 'ida.other.example', null],
    [staging, 'staging.interdomestik.com', 'pilot-mk'],
    [staging, 'ks.staging.interdomestik.com', 'tenant_ks'],
    [staging, 'mk.staging.interdomestik.com', 'tenant_mk'],
    [staging, 'ida.interdomestik.com', null],
    [development, 'ida.localhost:3000', 'tenant_al'],
    [development, 'IDA.127.0.0.1.nip.io:3000', 'tenant_al'],
    [development, 'ks.127.0.0.1.nip.io:3270', 'tenant_ks'],
    [development, 'mk.127.0.0.1.nip.io', 'tenant_mk'],
    [development, 'mk.192.168.1.1.nip.io', null],
    [development, 'ks.localhost', null],
    [development, 'localhost', null],
    [development, 'ida.localhost.', null],
    [development, 'http://ida.localhost', null],
    [development, 'ida.localhost, ida.localhost', null],
  ] as const)('uses exact ingress (%#)', (env, host, expected) => {
    expect(resolvePublicAdmissionTenant(new Headers({ host }), env)).toBe(expected);
  });

  it('requires host and exact forwarded authority, case-insensitively', () => {
    const host = 'ida.localhost:3000';
    expect(
      resolvePublicAdmissionTenant(
        new Headers({
          host,
          'x-forwarded-host': 'IDA.LOCALHOST:3000',
        }),
        development
      )
    ).toBe('tenant_al');
    for (const headers of [
      new Headers({ 'x-forwarded-host': host }),
      new Headers({ host, 'x-forwarded-host': '' }),
      new Headers({ host, 'x-forwarded-host': 'ida.localhost' }),
      new Headers({ host, 'x-forwarded-host': 'ida.localhost:3001' }),
    ])
      expect(resolvePublicAdmissionTenant(headers, development)).toBeNull();
  });

  it.each([undefined, '', 'tenant_unknown', ' tenant_ks '])(
    'rejects door requests for default %s and ignores tenant metadata',
    defaultTenant => {
      expect(
        resolvePublicAdmissionTenant(
          new Headers({
            host: 'ida.interdomestik.com',
            'x-tenant-id': 'tenant_ks',
            cookie: 'tenantId=tenant_ks',
            referer: 'https://ida.interdomestik.com/?tenant=tenant_ks',
          }),
          { ...production, DEFAULT_PUBLIC_TENANT_ID: defaultTenant }
        )
      ).toBeNull();
    }
  );
});
