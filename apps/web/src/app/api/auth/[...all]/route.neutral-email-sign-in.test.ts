import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  logAuditEvent: vi.fn(),
  handlerGET: vi.fn(),
  handlerPOST: vi.fn(),
  lookupUserTenantByEmail: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: hoisted.logAuditEvent }));
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/auth/tenant-lookup', () => ({
  lookupUserTenantByEmail: hoisted.lookupUserTenantByEmail,
}));
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ GET: hoisted.handlerGET, POST: hoisted.handlerPOST }),
}));

import { POST } from './route';

const NEUTRAL_HOST = 'www.interdomestik.com';
const MEMBER_EMAIL = 'member.mk@interdomestik.test';

type SignInRequestOptions = {
  host?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
};

function buildSignInRequest(options: SignInRequestOptions = {}): Request {
  const host = options.host ?? NEUTRAL_HOST;
  const path = options.path ?? '/api/auth/sign-in/email';

  return new Request(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      host,
      'content-type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(options.body ?? { email: MEMBER_EMAIL, password: 'provider-verifies' }),
  });
}

describe('POST /api/auth/[...all] neutral single-entry sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.handlerPOST.mockResolvedValue(new Response('ok', { status: 200 }));
    hoisted.logAuditEvent.mockResolvedValue(undefined);
    hoisted.lookupUserTenantByEmail.mockResolvedValue('tenant_mk');
  });

  it('delegates a no-hint neutral login to the unchanged provider handler', async () => {
    const req = buildSignInRequest();

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.handlerPOST).toHaveBeenCalledExactlyOnceWith(req);
    expect(hoisted.lookupUserTenantByEmail).not.toHaveBeenCalled();
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
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
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it('keeps the audited account mismatch denial for an explicit tenant hint', async () => {
    hoisted.lookupUserTenantByEmail.mockResolvedValue('tenant_mk');

    const res = await POST(
      buildSignInRequest({ host: 'ida.localhost:3000', headers: { 'x-tenant-id': 'tenant_ks' } })
    );

    expect(res.status).toBe(401);
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
    expect(hoisted.lookupUserTenantByEmail).toHaveBeenCalledExactlyOnceWith(MEMBER_EMAIL);
    expect(hoisted.logAuditEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: 'auth.signin_denied_wrong_tenant',
        entityType: 'auth',
        tenantId: 'tenant_ks',
        metadata: { route: '/api/auth/sign-in/email', reason: 'tenant_mismatch' },
      })
    );
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
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
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
