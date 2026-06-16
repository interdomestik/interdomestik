import { afterEach, describe, expect, it } from 'vitest';

import { resolveTenantContext } from './tenant-context';
import { resolveTenantContextFromSources } from './tenant-hosts';

const SESSION_KS = { user: { tenantId: 'tenant_ks' } };
const SESSION_MK = { user: { tenantId: 'tenant_mk' } };

const request = (url: string, headers: HeadersInit): Request => new Request(url, { headers });

describe('resolveTenantContext', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalDefaultPublicTenantId = process.env.DEFAULT_PUBLIC_TENANT_ID;
  const restoreEnv = (key: string, value: string | undefined): void => {
    if (value === undefined) {
      delete mutableEnv[key];
      return;
    }
    mutableEnv[key] = value;
  };

  afterEach(() => {
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('VERCEL_ENV', originalVercelEnv);
    restoreEnv('DEFAULT_PUBLIC_TENANT_ID', originalDefaultPublicTenantId);
  });

  it('resolves the four tenant contexts from host and session tenant truth', () => {
    expect(
      resolveTenantContext(request('https://ida.localhost/member', { host: 'ks.localhost:3000' }), {
        user: { tenantId: 'tenant_ks', legalTenantId: 'tenant_mk' },
      })
    ).toEqual({
      status: 'resolved',
      host_id: 'tenant_ks',
      booking_tenant_id: 'tenant_ks',
      access_tenant_id: 'tenant_ks',
      legal_tenant_id: 'tenant_mk',
      source: 'compatibility_alias',
    });
  });

  it('preserves existing request-source precedence for booking tenant resolution', () => {
    const req = request('https://ida.localhost/member?tenantId=tenant_mk', {
      cookie: 'tenantId=tenant_ks',
      host: 'localhost:3000',
      'x-tenant-id': 'tenant_mk',
    });

    const result = resolveTenantContext(req, SESSION_KS);
    const oldSwitch = resolveTenantContextFromSources({
      host: 'localhost:3000',
      cookieTenantId: 'tenant_ks',
      headerTenantId: 'tenant_mk',
      queryTenantId: 'tenant_mk',
    });

    expect(result.status).toBe('resolved');
    expect(result.booking_tenant_id).toBe(oldSwitch.tenantId);
    expect(result.source).toBe(oldSwitch.source);
  });

  it('ignores forwarded host by default and accepts it only as a trusted option', () => {
    const req = request('https://ida.localhost/member', {
      host: 'ida.localhost:3000',
      'x-forwarded-host': 'ks.localhost:3000',
    });

    expect(resolveTenantContext(req, SESSION_KS)).toMatchObject({ host_id: null });
    expect(resolveTenantContext(req, SESSION_KS, { trustForwardedHost: true })).toMatchObject({
      host_id: 'tenant_ks',
      status: 'resolved',
    });
  });

  it('reuses host/session mismatch semantics for conflicting tenant hosts', () => {
    const result = resolveTenantContext(
      request('https://ida.localhost/member', { host: 'ks.localhost:3000' }),
      SESSION_MK
    );

    expect(result).toMatchObject({
      status: 'tenant_mismatch',
      host_id: 'tenant_ks',
      booking_tenant_id: 'tenant_ks',
      access_tenant_id: 'tenant_mk',
      legal_tenant_id: 'tenant_mk',
    });
  });

  it('keeps neutral production hosts on the default public tenant and denies mismatched sessions', () => {
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_ks';

    const result = resolveTenantContext(
      request('https://ida.localhost/member?tenantId=tenant_mk', {
        cookie: 'tenantId=tenant_mk',
        host: 'localhost:3000',
        'x-tenant-id': 'tenant_mk',
      }),
      SESSION_MK
    );

    expect(result).toMatchObject({
      status: 'tenant_mismatch',
      host_id: null,
      booking_tenant_id: 'tenant_ks',
      access_tenant_id: 'tenant_mk',
      source: 'default_public',
    });
  });

  it('denies neutral-host cookie context when it conflicts with the session tenant', () => {
    const result = resolveTenantContext(
      request('https://ida.localhost/member', {
        cookie: 'tenantId=tenant_mk',
        host: 'localhost:3000',
      }),
      SESSION_KS
    );

    expect(result).toMatchObject({
      status: 'tenant_mismatch',
      booking_tenant_id: 'tenant_mk',
      access_tenant_id: 'tenant_ks',
    });
  });

  it('reports missing session tenant without widening access on neutral hosts', () => {
    delete mutableEnv.DEFAULT_PUBLIC_TENANT_ID;

    const result = resolveTenantContext(
      request('https://ida.localhost/member', { host: 'ida.localhost:3000' }),
      null
    );

    expect(result).toEqual({
      status: 'missing_session_tenant',
      host_id: null,
      booking_tenant_id: 'tenant_ks',
      access_tenant_id: null,
      legal_tenant_id: null,
      source: 'default_public',
    });
  });
});
