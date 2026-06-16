import { describe, expect, it } from 'vitest';

import { resolveTenantContext } from './tenant-context';

const request = (url: string, headers: HeadersInit): Request => new Request(url, { headers });

describe('resolveTenantContext tenant concept separation', () => {
  it('keeps host, booking, access, and legal tenant concepts distinct when session provides them', () => {
    const result = resolveTenantContext(
      request('https://ida.localhost/member', { host: 'ida.localhost:3000' }),
      {
        user: {
          accessTenantId: 'tenant_ks',
          bookingTenantId: 'tenant_mk',
          legalTenantId: 'tenant_al',
          tenantId: 'tenant_al',
        },
      }
    );

    expect(result).toEqual({
      status: 'resolved',
      host_id: null,
      booking_tenant_id: 'tenant_mk',
      access_tenant_id: 'tenant_ks',
      legal_tenant_id: 'tenant_al',
      source: 'session',
    });
  });

  it('keeps tenantId as the compatibility access tenant when explicit access tenant is absent', () => {
    const result = resolveTenantContext(
      request('https://ida.localhost/member', { host: 'ida.localhost:3000' }),
      {
        user: {
          bookingTenantId: 'tenant_mk',
          legalTenantId: 'tenant_al',
          tenantId: 'tenant_ks',
        },
      }
    );

    expect(result).toMatchObject({
      status: 'resolved',
      booking_tenant_id: 'tenant_mk',
      access_tenant_id: 'tenant_ks',
      legal_tenant_id: 'tenant_al',
    });
  });

  it('does not grant access from booking or legal tenant without an access tenant', () => {
    const result = resolveTenantContext(
      request('https://ida.localhost/member', {
        cookie: 'tenantId=tenant_mk',
        host: 'ida.localhost:3000',
      }),
      {
        user: {
          bookingTenantId: 'tenant_ks',
          legalTenantId: 'tenant_al',
        },
      }
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
