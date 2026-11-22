import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  appendAnonymousTenantAuditEvent: vi.fn(),
  handlerGET: vi.fn(),
  handlerPOST: vi.fn(),
  publicIntakeOpen: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));
vi.mock('@/lib/tenant/public-intake-admission', () => ({
  isPublicIntakeOpenForTenant: hoisted.publicIntakeOpen,
}));

vi.mock('@interdomestik/database', () => ({
  appendAnonymousTenantAuditEvent: hoisted.appendAnonymousTenantAuditEvent,
}));

vi.mock('@/lib/audit.core', () => ({
  extractRequestMetadata: (headers: Headers) => ({
    ip: headers.get('x-forwarded-for') ?? undefined,
    userAgent: headers.get('user-agent') ?? undefined,
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: {},
}));

vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({
    GET: hoisted.handlerGET,
    POST: hoisted.handlerPOST,
  }),
}));

import { GET, POST } from './route';

describe('password sign-up admission', () => {
  function request(tenant = 'tenant_ks', forwarded?: string) {
    return new Request('https://ida.interdomestik.com/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        host: 'ida.interdomestik.com',
        'content-type': 'application/json',
        ...(forwarded ? { 'x-forwarded-host': forwarded } : {}),
      },
      body: JSON.stringify({ onboarding: { tenant, mode: 'deferred' } }),
    });
  }

  beforeEach(() => {
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', '1');
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
    hoisted.enforceRateLimit.mockReset().mockResolvedValue(null);
    hoisted.publicIntakeOpen.mockReset().mockResolvedValue(false);
    hoisted.handlerPOST.mockReset().mockResolvedValue(new Response());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('returns the existing unauthorized shape before reaching Better Auth when intake is closed', async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
    });
    expect(hoisted.publicIntakeOpen).toHaveBeenCalledExactlyOnceWith('tenant_ks');
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });

  it('admits a matching selector only while its ingress tenant is open', async () => {
    hoisted.publicIntakeOpen.mockResolvedValue(true);
    expect((await POST(request('tenant_mk'))).status).toBe(401);
    expect(hoisted.publicIntakeOpen).not.toHaveBeenCalled();
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
    expect(hoisted.publicIntakeOpen).toHaveBeenCalledExactlyOnceWith('tenant_ks');
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
  });

  it('rejects a forwarded-host mismatch before rate limits, admission and Better Auth', async () => {
    expect((await POST(request('tenant_ks', 'other.example'))).status).toBe(401);
    expect(hoisted.enforceRateLimit).not.toHaveBeenCalled();
    expect(hoisted.publicIntakeOpen).not.toHaveBeenCalled();
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/[...all]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.handlerGET.mockResolvedValue(new Response('ok', { status: 200 }));
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new Request('http://localhost:3000/api/auth/session');
    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
    expect(hoisted.handlerGET).not.toHaveBeenCalled();
  });

  it('delegates to better-auth handler when not rate limited', async () => {
    const req = new Request('http://app.example.test/api/auth/session', {
      headers: { host: 'app.example.test' },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(hoisted.handlerGET).toHaveBeenCalledTimes(1);
    expect(hoisted.handlerGET).toHaveBeenCalledWith(req);
    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'api/auth',
        productionSensitive: true,
      })
    );
  });

  it('bypasses auth rate limiting on loopback development hosts', async () => {
    const req = new Request('http://localhost:3000/api/auth/session', {
      headers: { host: 'mk.127.0.0.1.nip.io:3000' },
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(hoisted.enforceRateLimit).not.toHaveBeenCalled();
    expect(hoisted.handlerGET).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/auth/[...all]', () => {
  function buildEmailSignInRequest(options?: { host?: string; email?: string }) {
    return new Request('http://app.example.test/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        host: options?.host ?? 'ks.localhost:3000',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: options?.email ?? 'admin.ks@plan070.example.invalid',
        password: 'not-used-in-route-test',
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.handlerPOST.mockResolvedValue(new Response('ok', { status: 200 }));
    hoisted.appendAnonymousTenantAuditEvent.mockResolvedValue(true);
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new Request('http://localhost:3000/api/auth/sign-in', { method: 'POST' });
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });

  it('logs audit event for password reset request (no PII)', async () => {
    const req = new Request('http://localhost:3000/api/auth/request-password-reset', {
      method: 'POST',
      headers: { host: 'ks.localhost:3000' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.appendAnonymousTenantAuditEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.appendAnonymousTenantAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password_reset_requested',
        entityType: 'auth',
        tenantId: 'tenant_ks',
        metadata: { route: '/api/auth/request-password-reset', redirectTarget: null },
      })
    );
  });

  it('bounds attacker-controlled request metadata on the password reset audit', async () => {
    const req = new Request('http://localhost:3000/api/auth/request-password-reset', {
      method: 'POST',
      headers: {
        host: 'ks.localhost:3000',
        'user-agent': 'a'.repeat(5_000),
        'x-forwarded-for': '9'.repeat(200),
      },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const [event] = hoisted.appendAnonymousTenantAuditEvent.mock.calls[0];
    expect(event.metadata.userAgent).toBe('a'.repeat(512));
    expect(event.metadata.ip).toBe('9'.repeat(64));
  });

  it('appends no password reset audit when the front door names no tenant', async () => {
    const req = new Request('http://ida.localhost:3000/api/auth/request-password-reset', {
      method: 'POST',
      headers: { host: 'ida.localhost:3000' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
  });

  it('still serves the password reset request when the audit append fails', async () => {
    hoisted.appendAnonymousTenantAuditEvent.mockRejectedValue(new Error('db down'));
    const req = new Request('http://localhost:3000/api/auth/request-password-reset', {
      method: 'POST',
      headers: { host: 'ks.localhost:3000' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
  });

  it('does not log audit for other auth routes', async () => {
    const req = new Request('http://app.example.test/api/auth/sign-in', {
      method: 'POST',
      headers: { host: 'app.example.test' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.appendAnonymousTenantAuditEvent).not.toHaveBeenCalled();
    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'api/auth',
        productionSensitive: true,
      })
    );
  });

  it('applies only the dedicated identity bucket for email sign-in', async () => {
    hoisted.enforceRateLimit.mockResolvedValueOnce(new Response('limited', { status: 429 }));

    const req = buildEmailSignInRequest({
      email: '  ADMIN.KS@plan070.example.invalid ',
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(hoisted.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'api/auth/sign-in/email:identity',
        limit: 20,
        keySuffix: 'tenant:tenant_ks:email_hash:78e38b7c59de97579084',
        productionSensitive: true,
      })
    );
  });

  it('uses the default public tenant to key neutral-host email sign-in traffic', async () => {
    hoisted.enforceRateLimit.mockResolvedValueOnce(new Response('limited', { status: 429 }));

    const req = buildEmailSignInRequest({ host: 'app.example.test' });

    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(hoisted.enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'api/auth/sign-in/email:identity',
        limit: 20,
        keySuffix: 'tenant:tenant_ks:email_hash:78e38b7c59de97579084',
        productionSensitive: true,
      })
    );
  });

  it('bypasses auth rate limiting for loopback login posts in development', async () => {
    const req = new Request('http://localhost:3000/api/auth/sign-in', {
      method: 'POST',
      headers: { host: 'ks.127.0.0.1.nip.io:3000' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.enforceRateLimit).not.toHaveBeenCalled();
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
  });
});
