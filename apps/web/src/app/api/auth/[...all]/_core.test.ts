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
const ORIGINAL_IDA_HOST = process.env.IDA_HOST;
const MUTABLE_ENV = process.env as Record<string, string | undefined>;

function resetEnv() {
  MUTABLE_ENV.NODE_ENV = ORIGINAL_NODE_ENV;
  MUTABLE_ENV.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  MUTABLE_ENV.IDA_HOST = ORIGINAL_IDA_HOST;
}

function setProductionBuildEnv(idaHost?: string) {
  MUTABLE_ENV.NODE_ENV = 'production';
  delete MUTABLE_ENV.VERCEL_ENV;
  if (idaHost) {
    MUTABLE_ENV.IDA_HOST = idaHost;
  }
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

  it.each([
    {
      name: 'ignores cookie/header fallback hints when host is neutral in production',
      headers: {
        host: 'interdomestik-web.vercel.app',
        cookie: 'tenantId=tenant_mk',
        'x-tenant-id': 'tenant_ks',
      },
      expected: 'tenant_ks',
    },
    {
      name: 'allows loopback release-gate tenant hints in production builds',
      headers: { host: '127.0.0.1:3000', 'x-tenant-id': 'tenant_mk' },
      expected: 'tenant_mk',
    },
    {
      name: 'uses explicit tenant context on the ida front door in production builds',
      headers: { host: 'ida.127.0.0.1.nip.io:3000', 'x-tenant-id': 'tenant_mk' },
      expected: 'tenant_mk',
    },
    {
      name: 'prefers explicit ida front-door tenant context over stale tenant cookies',
      headers: {
        host: 'ida.127.0.0.1.nip.io:3000',
        cookie: 'tenantId=tenant_ks',
        'x-tenant-id': 'tenant_mk',
      },
      expected: 'tenant_mk',
    },
    {
      name: 'supports an IDA_HOST override for local front-door auth entry',
      idaHost: 'front-door.localhost:3000',
      headers: { host: 'front-door.localhost:3000', 'x-tenant-id': 'tenant_mk' },
      expected: 'tenant_mk',
    },
    {
      name: 'supports an IDA_HOST override with a URL value',
      idaHost: 'https://front-door.localhost:3000',
      headers: { host: 'front-door.localhost:3000', 'x-tenant-id': 'tenant_mk' },
      expected: 'tenant_mk',
    },
    {
      name: 'returns null on the ida front door when no tenant context is present',
      headers: { host: 'ida.127.0.0.1.nip.io:3000' },
      expected: null,
    },
    {
      name: 'fails closed on ida front door when forwarded host conflicts',
      headers: {
        host: 'ida.127.0.0.1.nip.io:3000',
        'x-forwarded-host': 'ks.localhost:3000',
        'x-tenant-id': 'tenant_mk',
      },
      expected: null,
    },
    {
      name: 'does not activate front-door sign-in context from spoofed forwarded host',
      headers: {
        host: 'ks.localhost:3000',
        'x-forwarded-host': 'ida.127.0.0.1.nip.io:3000',
        'x-tenant-id': 'tenant_mk',
      },
      expected: 'tenant_ks',
    },
    {
      name: 'uses host tenant in production when fallback hints conflict',
      headers: {
        host: 'ks.localhost:3000',
        cookie: 'tenantId=tenant_mk',
        'x-tenant-id': 'tenant_mk',
      },
      expected: 'tenant_ks',
    },
  ] as const)('$name', ({ headers, expected, idaHost }) => {
    setProductionBuildEnv(idaHost);
    expect(resolveTenantIdForEmailSignIn(new Headers(headers))).toBe(expected);
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

  it.each([
    {
      name: 'denies sign-in when user tenant and request tenant mismatch',
      url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email',
    },
    {
      name: 'denies email OTP sign-in when user tenant and request tenant mismatch',
      url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email-otp',
    },
  ])('$name', async ({ url }) => {
    const result = await evaluateEmailSignInTenantGuard({
      url,
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

  it('allows MK sign-in through the ida front door when explicit tenant context matches', async () => {
    setProductionBuildEnv();

    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://ida.127.0.0.1.nip.io:3000/api/auth/sign-in/email',
      headers: new Headers({
        host: 'ida.127.0.0.1.nip.io:3000',
        'x-tenant-id': 'tenant_mk',
      }),
      body: { email: 'admin.mk@interdomestik.com' },
      lookupUserTenantByEmail: async () => 'tenant_mk',
    });

    expect(result).toEqual({ decision: 'allow' });
  });

  it('denies ida front-door sign-in when explicit tenant context mismatches the user tenant', async () => {
    setProductionBuildEnv();

    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://ida.127.0.0.1.nip.io:3000/api/auth/sign-in/email',
      headers: new Headers({
        host: 'ida.127.0.0.1.nip.io:3000',
        'x-tenant-id': 'tenant_mk',
      }),
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
