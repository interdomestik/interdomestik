import { afterEach, describe, expect, it } from 'vitest';

import {
  evaluateEmailSignInTenantGuard,
  extractEmailFromSignInBody,
  getAuthRateLimitConfig,
  getAuthRateLimitKeySuffix,
  getPasswordResetAuditEventFromUrl,
  isEmailSignInUrl,
  resolveTenantIdForEmailSignIn,
  resolveTenantIdForPasswordResetAudit,
} from './_core';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
const MUTABLE_ENV = process.env as Record<string, string | undefined>;

function resetEnv() {
  MUTABLE_ENV.NODE_ENV = ORIGINAL_NODE_ENV;
  MUTABLE_ENV.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
}

afterEach(() => {
  resetEnv();
});

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

describe('getAuthRateLimitConfig', () => {
  it('uses a dedicated higher bucket for get-session probes', () => {
    expect(
      getAuthRateLimitConfig('GET', 'https://interdomestik-web.vercel.app/api/auth/get-session')
    ).toEqual({
      name: 'api/auth/get-session',
      limit: 180,
      windowSeconds: 60,
    });
  });

  it('uses a dedicated sign-out bucket', () => {
    expect(
      getAuthRateLimitConfig('POST', 'https://interdomestik-web.vercel.app/api/auth/sign-out')
    ).toEqual({
      name: 'api/auth/sign-out',
      limit: 20,
      windowSeconds: 60,
    });
  });

  it('uses a higher pilot-safe bucket for sign-in', () => {
    expect(
      getAuthRateLimitConfig('POST', 'https://interdomestik-web.vercel.app/api/auth/sign-in/email')
    ).toEqual({
      name: 'api/auth/sign-in/email',
      limit: 20,
      windowSeconds: 60,
    });
  });

  it('uses the same dedicated bucket for email OTP sign-in', () => {
    expect(
      getAuthRateLimitConfig(
        'POST',
        'https://interdomestik-web.vercel.app/api/auth/sign-in/email-otp'
      )
    ).toEqual({
      name: 'api/auth/sign-in/email',
      limit: 20,
      windowSeconds: 60,
    });
  });
});

describe('getAuthRateLimitKeySuffix', () => {
  it('keys email sign-in rate limiting by tenant and normalized email', () => {
    const headers = new Headers({ host: 'ks.localhost:3000' });

    expect(
      getAuthRateLimitKeySuffix({
        method: 'POST',
        url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email',
        headers,
        body: { email: '  STAFF.KS@interdomestik.com ' },
      })
    ).toBe('tenant:tenant_ks:email_hash:a3b3cdfa6ffbc6575b5f');
  });

  it('returns null for non-email auth routes', () => {
    expect(
      getAuthRateLimitKeySuffix({
        method: 'POST',
        url: 'https://interdomestik-web.vercel.app/api/auth/request-password-reset',
        headers: new Headers({ host: 'ks.localhost:3000' }),
        body: { email: 'staff.ks@interdomestik.com' },
      })
    ).toBeNull();
  });

  it('returns null when tenant cannot be resolved', () => {
    expect(
      getAuthRateLimitKeySuffix({
        method: 'POST',
        url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email',
        headers: new Headers({ host: 'interdomestik-web.vercel.app' }),
        body: { email: 'staff.ks@interdomestik.com' },
      })
    ).toBe('tenant:tenant_ks:email_hash:a3b3cdfa6ffbc6575b5f');
  });

  it('keys email OTP sign-in rate limiting by tenant and normalized email', () => {
    const headers = new Headers({ host: 'ks.localhost:3000' });

    expect(
      getAuthRateLimitKeySuffix({
        method: 'POST',
        url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email-otp',
        headers,
        body: { email: '  STAFF.KS@interdomestik.com ' },
      })
    ).toBe('tenant:tenant_ks:email_hash:a3b3cdfa6ffbc6575b5f');
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

  it('falls back to cookie/header when host is neutral in production', () => {
    MUTABLE_ENV.NODE_ENV = 'production';
    delete MUTABLE_ENV.VERCEL_ENV;
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
    ).toBe('tenant_mk');
  });

  it('keeps host as canonical in production when fallback hints conflict', () => {
    MUTABLE_ENV.NODE_ENV = 'production';
    delete MUTABLE_ENV.VERCEL_ENV;
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

describe('isEmailSignInUrl', () => {
  it('returns true for email sign-in route', () => {
    expect(isEmailSignInUrl('https://interdomestik-web.vercel.app/api/auth/sign-in/email')).toBe(
      true
    );
  });

  it('returns false for non sign-in routes', () => {
    expect(
      isEmailSignInUrl('https://interdomestik-web.vercel.app/api/auth/request-password-reset')
    ).toBe(false);
  });
});

describe('resolveTenantIdForEmailSignIn', () => {
  it('prefers host-derived tenant', () => {
    const headers = new Headers({ host: 'ks.localhost:3000' });
    expect(resolveTenantIdForEmailSignIn(headers)).toBe('tenant_ks');
  });

  it('resolves the pilot tenant from host', () => {
    const headers = new Headers({ host: 'pilot.localhost:3000' });
    expect(resolveTenantIdForEmailSignIn(headers)).toBe('pilot-mk');
  });

  it('falls back to cookie', () => {
    const headers = new Headers({ cookie: 'tenantId=tenant_mk' });
    expect(resolveTenantIdForEmailSignIn(headers)).toBe('tenant_mk');
  });

  it('falls back to x-tenant-id header', () => {
    const headers = new Headers({ 'x-tenant-id': 'tenant_ks' });
    expect(resolveTenantIdForEmailSignIn(headers)).toBe('tenant_ks');
  });

  it('falls back to the default public tenant when host context is neutral', () => {
    const headers = new Headers();
    expect(resolveTenantIdForEmailSignIn(headers)).toBe('tenant_ks');
  });

  it('falls back to cookie/header in production when host is neutral', () => {
    MUTABLE_ENV.NODE_ENV = 'production';
    delete MUTABLE_ENV.VERCEL_ENV;
    const headers = new Headers({
      host: 'localhost:3000',
      cookie: 'tenantId=tenant_mk',
      'x-tenant-id': 'tenant_ks',
    });
    expect(resolveTenantIdForEmailSignIn(headers)).toBe('tenant_mk');
  });

  it('uses host tenant in production when fallback hints conflict', () => {
    MUTABLE_ENV.NODE_ENV = 'production';
    delete MUTABLE_ENV.VERCEL_ENV;
    const headers = new Headers({
      host: 'ks.localhost:3000',
      cookie: 'tenantId=tenant_mk',
      'x-tenant-id': 'tenant_mk',
    });
    expect(resolveTenantIdForEmailSignIn(headers)).toBe('tenant_ks');
  });
});

describe('extractEmailFromSignInBody', () => {
  it('normalizes email from payload', () => {
    expect(extractEmailFromSignInBody({ email: '  ADMIN.KS@interdomestik.com  ' })).toBe(
      'admin.ks@interdomestik.com'
    );
  });

  it('returns null for invalid payload', () => {
    expect(extractEmailFromSignInBody({})).toBeNull();
  });
});

describe('evaluateEmailSignInTenantGuard', () => {
  it('allows sign-in on a neutral host by using the default public tenant', async () => {
    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email',
      headers: new Headers(),
      body: { email: 'admin.ks@interdomestik.com' },
      lookupUserTenantByEmail: async () => 'tenant_ks',
    });

    expect(result).toEqual({ decision: 'allow' });
  });

  it('denies sign-in when user tenant and request tenant mismatch', async () => {
    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email',
      headers: new Headers({ 'x-tenant-id': 'tenant_mk' }),
      body: { email: 'admin.ks@interdomestik.com' },
      lookupUserTenantByEmail: async () => 'tenant_ks',
    });

    expect(result).toEqual({
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'tenant_mismatch',
      resolvedTenantId: 'tenant_mk',
    });
  });

  it('denies email OTP sign-in when user tenant and request tenant mismatch', async () => {
    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email-otp',
      headers: new Headers({ 'x-tenant-id': 'tenant_mk' }),
      body: { email: 'admin.ks@interdomestik.com' },
      lookupUserTenantByEmail: async () => 'tenant_ks',
    });

    expect(result).toEqual({
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'tenant_mismatch',
      resolvedTenantId: 'tenant_mk',
    });
  });

  it('allows sign-in when tenant matches', async () => {
    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email',
      headers: new Headers({ host: 'ks.localhost:3000' }),
      body: { email: 'admin.ks@interdomestik.com' },
      lookupUserTenantByEmail: async () => 'tenant_ks',
    });

    expect(result).toEqual({ decision: 'allow' });
  });

  it('allows sign-in when pilot tenant matches the host', async () => {
    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email',
      headers: new Headers({ host: 'pilot.localhost:3000' }),
      body: { email: 'member.pilot.prishtina.01@interdomestik.com' },
      lookupUserTenantByEmail: async () => 'pilot-mk',
    });

    expect(result).toEqual({ decision: 'allow' });
  });
});
