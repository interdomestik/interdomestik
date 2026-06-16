import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveTenantContext } from './tenant-context';

const SESSION_KS = { user: { tenantId: 'tenant_ks' } };
const SESSION_MK = { user: { tenantId: 'tenant_mk' } };

const request = (url: string, headers: HeadersInit): Request => new Request(url, { headers });

describe('resolveTenantContext session precedence', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lets session tenant override stale cookie on neutral hosts', () => {
    const result = resolveTenantContext(
      request('https://ida.localhost/member', {
        cookie: 'tenantId=tenant_mk',
        host: 'ida.localhost:3000',
      }),
      SESSION_KS
    );

    expect(result).toMatchObject({
      status: 'resolved',
      host_id: null,
      booking_tenant_id: 'tenant_ks',
      access_tenant_id: 'tenant_ks',
      source: 'session',
    });
  });

  it('keeps tenant-host mismatch protection stronger than stale cookie precedence', () => {
    const result = resolveTenantContext(
      request('https://mk.localhost/member', {
        cookie: 'tenantId=tenant_mk',
        host: 'mk.localhost:3000',
      }),
      SESSION_KS
    );

    expect(result).toMatchObject({
      status: 'tenant_mismatch',
      host_id: 'tenant_mk',
      booking_tenant_id: 'tenant_mk',
      access_tenant_id: 'tenant_ks',
      source: 'compatibility_alias',
    });
  });

  it('keeps host-only context as an anonymous booking hint without access', () => {
    const result = resolveTenantContext(
      request('https://mk.localhost/member', { host: 'mk.localhost:3000' }),
      null
    );

    expect(result).toMatchObject({
      status: 'missing_session_tenant',
      host_id: 'tenant_mk',
      booking_tenant_id: 'tenant_mk',
      access_tenant_id: null,
      legal_tenant_id: null,
    });
  });

  it('keeps neutral production hosts default-only while session tenant controls access', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');

    const result = resolveTenantContext(
      request('https://ida.localhost/member?tenantId=tenant_mk', {
        cookie: 'tenantId=tenant_mk',
        host: 'localhost:3000',
        'x-tenant-id': 'tenant_mk',
      }),
      SESSION_MK
    );

    expect(result).toMatchObject({
      status: 'resolved',
      host_id: null,
      booking_tenant_id: 'tenant_mk',
      access_tenant_id: 'tenant_mk',
      source: 'session',
    });
  });

  it('treats invalid session tenant as missing instead of widening access to hints', () => {
    const result = resolveTenantContext(
      request('https://ida.localhost/member', {
        cookie: 'tenantId=tenant_mk',
        host: 'localhost:3000',
      }),
      { user: { tenantId: 'tenant_unknown' } }
    );

    expect(result).toMatchObject({
      status: 'missing_session_tenant',
      booking_tenant_id: 'tenant_mk',
      access_tenant_id: null,
      legal_tenant_id: null,
      source: 'cookie',
    });
  });
});
