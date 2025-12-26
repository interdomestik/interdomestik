import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  logAuditEvent: vi.fn(),
  handlerGET: vi.fn(),
  handlerPOST: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: hoisted.logAuditEvent,
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
    const req = new Request('http://localhost:3000/api/auth/session');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(hoisted.handlerGET).toHaveBeenCalledTimes(1);
    expect(hoisted.handlerGET).toHaveBeenCalledWith(req);
  });
});

describe('POST /api/auth/[...all]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.handlerPOST.mockResolvedValue(new Response('ok', { status: 200 }));
    hoisted.logAuditEvent.mockResolvedValue(undefined);
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
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password_reset_requested',
        entityType: 'auth',
        metadata: { route: '/api/auth/request-password-reset' },
        headers: req.headers,
      })
    );
  });

  it('does not log audit for other auth routes', async () => {
    const req = new Request('http://localhost:3000/api/auth/sign-in', { method: 'POST' });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });
});
