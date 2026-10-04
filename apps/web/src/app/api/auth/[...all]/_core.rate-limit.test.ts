import { describe, expect, it } from 'vitest';

import { getAuthRateLimitConfig, getAuthRateLimitKeySuffix } from './_core';

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

  it('leaves email OTP sign-in to its protected neutral-route limiter', () => {
    expect(
      getAuthRateLimitConfig(
        'POST',
        'https://interdomestik-web.vercel.app/api/auth/sign-in/email-otp'
      )
    ).toEqual({
      name: 'api/auth',
      limit: 5,
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

  it('uses a tenantless identity on an exact admitted neutral host', () => {
    expect(
      getAuthRateLimitKeySuffix({
        method: 'POST',
        url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email',
        headers: new Headers({ host: 'interdomestik-web.vercel.app' }),
        body: { email: 'staff.ks@interdomestik.com' },
      })
    ).toMatch(/^neutral:email_hash:[a-f0-9]{20}$/);
  });

  it('leaves email OTP identity keys to the HMAC neutral-route limiter', () => {
    const headers = new Headers({ host: 'ks.localhost:3000' });

    expect(
      getAuthRateLimitKeySuffix({
        method: 'POST',
        url: 'https://interdomestik-web.vercel.app/api/auth/sign-in/email-otp',
        headers,
        body: { email: '  STAFF.KS@interdomestik.com ' },
      })
    ).toBeNull();
  });
});
