import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPasswordResetAuditEventFromUrl, resolveTenantIdForPasswordResetAudit } from './_core';
import { setProductionBuildEnv } from './_core-test-env';

afterEach(() => vi.unstubAllEnvs());

describe('getPasswordResetAuditEventFromUrl', () => {
  it('returns audit payload for password reset route', () => {
    const event = getPasswordResetAuditEventFromUrl(
      'https://interdomestik-web.vercel.app/api/auth/request-password-reset'
    );

    expect(event).toEqual({
      action: 'auth.password_reset_requested',
      entityType: 'auth',
      metadata: { route: '/api/auth/request-password-reset' },
    });
  });

  it('returns null for other auth routes', () => {
    const event = getPasswordResetAuditEventFromUrl(
      'https://interdomestik-web.vercel.app/api/auth/sign-in/email'
    );

    expect(event).toBeNull();
  });
});

describe('resolveTenantIdForPasswordResetAudit', () => {
  it('prefers host-derived tenant', () => {
    const headers = new Headers({ host: 'ks.localhost:3000' });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://interdomestik-web.vercel.app/api/auth/request-password-reset',
        headers
      )
    ).toBe('tenant_ks');
  });

  it('falls back to tenant cookie', () => {
    const headers = new Headers({ cookie: 'foo=bar; tenantId=tenant_mk' });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://interdomestik-web.vercel.app/api/auth/request-password-reset',
        headers
      )
    ).toBe('tenant_mk');
  });

  it('falls back to x-tenant-id header', () => {
    const headers = new Headers({ 'x-tenant-id': 'tenant_ks' });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://interdomestik-web.vercel.app/api/auth/request-password-reset',
        headers
      )
    ).toBe('tenant_ks');
  });

  it('falls back to tenantId query parameter', () => {
    const headers = new Headers();

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://interdomestik-web.vercel.app/api/auth/request-password-reset?tenantId=tenant_mk',
        headers
      )
    ).toBe('tenant_mk');
  });

  it('falls back to the default public tenant when host context is neutral', () => {
    const headers = new Headers({ host: 'interdomestik-web.vercel.app' });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://interdomestik-web.vercel.app/api/auth/request-password-reset',
        headers
      )
    ).toBe('tenant_ks');
  });

  it('ignores cookie/header/query fallback hints when host is neutral in production', () => {
    setProductionBuildEnv();
    const headers = new Headers({
      host: 'interdomestik-web.vercel.app',
      cookie: 'tenantId=tenant_mk',
      'x-tenant-id': 'tenant_ks',
    });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://interdomestik-web.vercel.app/api/auth/request-password-reset?tenantId=tenant_mk',
        headers
      )
    ).toBe('tenant_ks');
  });

  it('allows loopback release-gate tenant hints in production builds', () => {
    setProductionBuildEnv();
    const headers = new Headers({
      host: '127.0.0.1:3000',
      'x-tenant-id': 'tenant_mk',
    });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://127.0.0.1:3000/api/auth/request-password-reset',
        headers
      )
    ).toBe('tenant_mk');
  });

  it('uses explicit tenant context on the ida front door in production builds', () => {
    setProductionBuildEnv();
    const headers = new Headers({
      host: 'ida.127.0.0.1.nip.io:3000',
      'x-tenant-id': 'tenant_mk',
    });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://ida.127.0.0.1.nip.io:3000/api/auth/request-password-reset',
        headers
      )
    ).toBe('tenant_mk');
  });

  it('ignores query tenant context on the ida front door in production builds', () => {
    setProductionBuildEnv();
    const headers = new Headers({ host: 'ida.127.0.0.1.nip.io:3000' });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://ida.127.0.0.1.nip.io:3000/api/auth/request-password-reset?tenantId=tenant_mk',
        headers
      )
    ).toBeNull();
  });

  it('fails closed on ida front door when forwarded host conflicts', () => {
    setProductionBuildEnv();
    const headers = new Headers({
      host: 'ida.127.0.0.1.nip.io:3000',
      'x-forwarded-host': 'ks.localhost:3000',
      'x-tenant-id': 'tenant_mk',
    });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://ida.127.0.0.1.nip.io:3000/api/auth/request-password-reset',
        headers
      )
    ).toBeNull();
  });

  it('does not activate front-door context from spoofed forwarded host in production builds', () => {
    setProductionBuildEnv();
    const headers = new Headers({
      host: 'ks.localhost:3000',
      'x-forwarded-host': 'ida.127.0.0.1.nip.io:3000',
      'x-tenant-id': 'tenant_mk',
    });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://ks.localhost:3000/api/auth/request-password-reset',
        headers
      )
    ).toBe('tenant_ks');
  });

  it('keeps host as canonical in production when fallback hints conflict', () => {
    setProductionBuildEnv();
    const headers = new Headers({
      host: 'ks.localhost:3000',
      cookie: 'tenantId=tenant_mk',
      'x-tenant-id': 'tenant_mk',
    });

    expect(
      resolveTenantIdForPasswordResetAudit(
        'https://interdomestik-web.vercel.app/api/auth/request-password-reset?tenantId=tenant_mk',
        headers
      )
    ).toBe('tenant_ks');
  });
});
