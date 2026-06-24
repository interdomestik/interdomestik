import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  handlerPOST: vi.fn(),
  logAuditEvent: vi.fn(),
  lookupUserTenantByEmail: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: hoisted.logAuditEvent }));
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/auth/tenant-lookup', () => ({
  lookupUserTenantByEmail: hoisted.lookupUserTenantByEmail,
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ GET: vi.fn(), POST: hoisted.handlerPOST }),
}));

import { POST } from './route';

function signInRequest(tenantId: string, cookieTenantId = 'tenant_ks'): Request {
  return new Request('http://ida.localhost:3000/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      host: 'ida.localhost:3000',
      'content-type': 'application/json',
      cookie: `tenantId=${cookieTenantId}`,
    },
    body: JSON.stringify({
      additionalData: { tenantId },
      email: 'admin.mk@interdomestik.com',
      password: 'not-used-in-route-test',
    }),
  });
}

describe('POST /api/auth/[...all] live-login cutover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.handlerPOST.mockResolvedValue(new Response('ok', { status: 200 }));
    hoisted.lookupUserTenantByEmail.mockResolvedValue('tenant_mk');
  });

  it('uses the validated IDA booking tenant hint before delegating to better-auth', async () => {
    const res = await POST(signInRequest('tenant_mk'));

    expect(res.status).toBe(200);
    expect(hoisted.handlerPOST).toHaveBeenCalledTimes(1);
    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        keySuffix: expect.stringContaining('tenant:tenant_mk:email_hash:'),
        name: 'api/auth/sign-in/email:identity',
      })
    );
  });

  it('rejects invalid IDA booking tenant hints before better-auth runs', async () => {
    const res = await POST(signInRequest('evil_tenant', 'tenant_mk'));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
    });
    expect(hoisted.handlerPOST).not.toHaveBeenCalled();
  });
});
