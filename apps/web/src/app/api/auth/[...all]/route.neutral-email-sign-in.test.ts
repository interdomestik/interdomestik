import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMBER_EMAIL,
  NEUTRAL_HOST,
  buildSignInRequest,
  hoisted,
} from './route.neutral-email-sign-in.test-support';
import type { RateLimitOptions } from '@/lib/rate-limit.core';
import { buildRateLimitKey } from '@/lib/rate-limit-upstash';
import { POST } from './route';

describe('POST /api/auth/[...all] neutral single-entry sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.handlerPOST.mockResolvedValue(new Response('ok', { status: 200 }));
    hoisted.appendAnonymousTenantAuditEvent.mockResolvedValue(true);
    hoisted.lookupUserTenantByEmail.mockResolvedValue('tenant_mk');
  });

  it('delegates a no-hint neutral login to the unchanged provider handler', async () => {
    const req = buildSignInRequest();

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.handlerPOST).toHaveBeenCalledExactlyOnceWith(req);
    expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
  });

  it('returns the provider generic credential failure unchanged', async () => {
    hoisted.handlerPOST.mockResolvedValue(
      Response.json(
        { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
        { status: 401 }
      )
    );

    const res = await POST(
      buildSignInRequest({ body: { email: 'nobody@example.test', password: 'x' } })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: 'INVALID_EMAIL_OR_PASSWORD',
      message: 'Invalid email or password',
    });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
  });

  it('keeps the route rate limit ahead of the provider handler', async () => {
    hoisted.enforceRateLimit.mockResolvedValueOnce(new Response('limited', { status: 429 }));

    const res = await POST(buildSignInRequest());

    expect(res.status).toBe(429);
    expect(hoisted.enforceRateLimit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: 'api/auth/sign-in/email:identity',
        limit: 20,
        productionSensitive: true,
      })
    );
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
    expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
  });

  it('forwards a hostile origin to the provider instead of pre-approving it', async () => {
    const req = buildSignInRequest({ headers: { origin: 'https://evil.example' } });
    hoisted.handlerPOST.mockResolvedValue(new Response('forbidden', { status: 403 }));

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(hoisted.handlerPOST).toHaveBeenCalledExactlyOnceWith(req);
    expect(req.headers.get('origin')).toBe('https://evil.example');
  });

  it('blocks the 21st attempt for one account and IP despite rotating tenant cookies', async () => {
    const counts = new Map<string, number>();
    hoisted.enforceRateLimit.mockImplementation(async (options: RateLimitOptions) => {
      const key = buildRateLimitKey(options);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count > options.limit
        ? Response.json({ error: 'Too Many Requests' }, { status: 429 })
        : null;
    });
    hoisted.handlerPOST.mockImplementation(async () =>
      Response.json({ code: 'INVALID_EMAIL_OR_PASSWORD' }, { status: 401 })
    );
    const cookies = ['', 'tenant_ks', 'tenant_mk', 'pilot-mk', 'tenant_al', 'unknown', '%E0%A4%A'];

    for (let attempt = 0; attempt < 21; attempt++) {
      const cookie = cookies[attempt % cookies.length];
      const res = await POST(
        buildSignInRequest({
          headers: {
            'x-forwarded-for': '192.0.2.10',
            ...(cookie ? { cookie: `tenantId=${cookie}` } : {}),
          },
          body: {
            email: attempt % 2 === 0 ? MEMBER_EMAIL : `  ${MEMBER_EMAIL.toUpperCase()} `,
            password: 'provider-verifies',
          },
        })
      );
      expect(res.status).toBe(attempt < 20 ? 401 : 429);
      expect(await res.json()).toEqual(
        attempt < 20 ? { code: 'INVALID_EMAIL_OR_PASSWORD' } : { error: 'Too Many Requests' }
      );
    }
    expect(counts.size).toBe(1);
    expect([...counts.values()]).toEqual([21]);
    expect(hoisted.enforceRateLimit).toHaveBeenCalledTimes(21);
    for (const [options] of hoisted.enforceRateLimit.mock.calls) {
      expect(options).toMatchObject({
        name: 'api/auth/sign-in/email:identity',
        limit: 20,
        windowSeconds: 60,
        keySuffix: expect.stringMatching(/^neutral:email_hash:[a-f0-9]{20}$/),
        productionSensitive: true,
      });
    }
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(20);
    expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
  });

  it('denies a conflicting tenant hint before reaching the provider', async () => {
    const res = await POST(
      buildSignInRequest({
        headers: { 'x-tenant-id': 'tenant_mk' },
        body: {
          email: MEMBER_EMAIL,
          password: 'provider-verifies',
          additionalData: { tenantId: 'tenant_ks' },
        },
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
    });
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
    expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
  });

  it('keeps the audited account mismatch denial for an explicit tenant hint', async () => {
    hoisted.lookupUserTenantByEmail.mockResolvedValue('tenant_mk');

    const res = await POST(
      buildSignInRequest({ host: 'ida.localhost:3000', headers: { 'x-tenant-id': 'tenant_ks' } })
    );

    expect(res.status).toBe(401);
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
    expect(hoisted.lookupUserTenantByEmail).toHaveBeenCalledExactlyOnceWith(MEMBER_EMAIL);
    expect(hoisted.appendAnonymousTenantAuditEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: 'auth.signin_denied_wrong_tenant',
        entityType: 'auth',
        tenantId: 'tenant_ks',
        metadata: { route: '/api/auth/sign-in/email', reason: 'tenant_mismatch' },
      })
    );
  });

  it('keeps the account mismatch audit within the append cap for hostile paths and headers', async () => {
    hoisted.lookupUserTenantByEmail.mockResolvedValue('tenant_mk');

    const res = await POST(
      buildSignInRequest({
        host: 'ida.localhost:3000',
        path: `/api/auth/${'p'.repeat(4_000)}/api/auth/sign-in/email`,
        headers: {
          'x-tenant-id': 'tenant_ks',
          'user-agent': `"\\\u0001\u00e9`.repeat(1_000),
          'x-forwarded-for': '\u0001'.repeat(500),
        },
      })
    );

    expect(res.status).toBe(401);
    const [event] = hoisted.appendAnonymousTenantAuditEvent.mock.calls[0];
    expect(event.metadata.route).toBe('/api/auth/sign-in/email');
    expect(event.metadata.userAgent).toHaveLength(512);
    expect(event.metadata.ip).toBe('?'.repeat(64));
    expect(Buffer.byteLength(JSON.stringify(event.metadata), 'utf8')).toBeLessThanOrEqual(2_048);
  });

  it('terminates a comma-spliced forwarded host before the provider handler', async () => {
    const res = await POST(
      buildSignInRequest({
        headers: {
          'x-forwarded-host': `${NEUTRAL_HOST}, evil.example`,
          cookie: 'tenantId=tenant_mk',
        },
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
    });
    // The account tenant matches the cookie, so a legacy fall-through would have authenticated.
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
    expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
  });

  it('forwards a matching explicit tenant hint on a canonical neutral host to the provider', async () => {
    const req = buildSignInRequest({
      headers: { cookie: 'tenantId=tenant_ks' },
      body: {
        email: MEMBER_EMAIL,
        password: 'provider-verifies',
        additionalData: { tenantId: 'tenant_mk' },
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.handlerPOST).toHaveBeenCalledExactlyOnceWith(req);
    expect(hoisted.lookupUserTenantByEmail).toHaveBeenCalledExactlyOnceWith(MEMBER_EMAIL);
  });

  it('leaves the neutral OTP boundary on its own narrow host list', async () => {
    const res = await POST(buildSignInRequest({ path: '/api/auth/sign-in/email-otp' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'OTP_UNAVAILABLE', message: 'Unable to verify' });
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });

  it('leaves an unrelated auth endpoint delegating as before', async () => {
    const req = new Request(`https://${NEUTRAL_HOST}/api/auth/sign-out`, {
      method: 'POST',
      headers: { host: NEUTRAL_HOST },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.handlerPOST).toHaveBeenCalledExactlyOnceWith(req);
    expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
  });
});
