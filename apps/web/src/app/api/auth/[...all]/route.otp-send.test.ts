import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceOtpRateLimits: vi.fn(),
  handlerPost: vi.fn(),
  lookupTenant: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('@/lib/rate-limit-otp', () => ({
  enforceOtpRateLimits: mocks.enforceOtpRateLimits,
}));
vi.mock('@/lib/auth/tenant-lookup', () => ({ lookupUserTenantByEmail: mocks.lookupTenant }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: {} } }));
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ GET: vi.fn(), POST: mocks.handlerPost }),
}));

import { POST } from './route';

function sendRequest(email: string, extra: Record<string, unknown> = {}) {
  return new Request('https://ida.interdomestik.com/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    headers: {
      host: 'ida.interdomestik.com',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.8',
    },
    body: JSON.stringify({ email, type: 'sign-in', ...extra }),
  });
}

describe('IDA-UI03a0b2 neutral OTP send route', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OTP_RATE_LIMIT_HMAC_SECRET', 's'.repeat(32));
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.enforceOtpRateLimits.mockReset().mockResolvedValue(null);
    mocks.handlerPost.mockReset().mockImplementation(async () => Response.json({ success: true }));
    mocks.lookupTenant.mockReset().mockResolvedValue('tenant_mk');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('C05 derives the default tenant server-side and ignores every tenant override', async () => {
    const response = await POST(
      sendRequest('member@example.com', {
        tenantId: 'tenant_mk',
        tenantClassificationPending: false,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.lookupTenant).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.enforceOtpRateLimits).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'send',
        tenantId: 'tenant_ks',
        email: 'member@example.com',
        secret: 's'.repeat(32),
        dimensions: ['identity'],
      })
    );
    expect(mocks.enforceOtpRateLimits.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ kind: 'send', dimensions: ['ip'] })
    );
    const forwarded = mocks.handlerPost.mock.calls[0]?.[0] as Request;
    expect(await forwarded.json()).toEqual({ email: 'member@example.com', type: 'sign-in' });
  });

  it('C06 keeps registered and unregistered requests on one generic pre-response trace', async () => {
    const registered = await POST(sendRequest('registered@example.com'));
    const registeredTrace = mocks.enforceOtpRateLimits.mock.calls.map(([arg]) => arg.kind);
    mocks.enforceOtpRateLimits.mockClear();
    const unregistered = await POST(sendRequest('new@example.com'));
    const unregisteredTrace = mocks.enforceOtpRateLimits.mock.calls.map(([arg]) => arg.kind);

    expect(await registered.json()).toEqual({ success: true });
    expect(await unregistered.json()).toEqual({ success: true });
    expect(registeredTrace).toEqual(['send', 'send']);
    expect(unregisteredTrace).toEqual(registeredTrace);
    expect(mocks.lookupTenant).not.toHaveBeenCalled();
  });
});
