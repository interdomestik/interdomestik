import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceOtpRateLimits: vi.fn(),
  getSession: vi.fn(),
  handlerPost: vi.fn(),
  lookupTenant: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('@/lib/rate-limit-otp', () => ({
  enforceOtpRateLimits: mocks.enforceOtpRateLimits,
}));
vi.mock('@/lib/auth/tenant-lookup', () => ({ lookupUserTenantByEmail: mocks.lookupTenant }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession, revokeSession: vi.fn() } },
}));
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ GET: vi.fn(), POST: mocks.handlerPost }),
}));

import { POST } from './route';

function verifyRequest(body: Record<string, unknown>) {
  return new Request('https://ida.interdomestik.com/api/auth/sign-in/email-otp', {
    method: 'POST',
    headers: {
      host: 'ida.interdomestik.com',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
    },
    body: JSON.stringify({ email: 'member@example.com', otp: '123456', ...body }),
  });
}

describe('IDA-UI03a0b2 neutral OTP verify route', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OTP_RATE_LIMIT_HMAC_SECRET', 's'.repeat(32));
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.enforceOtpRateLimits.mockReset().mockResolvedValue(null);
    mocks.getSession.mockReset().mockResolvedValue({
      session: { token: 'new-session-token', userId: 'user-1' },
      user: { id: 'user-1', tenantId: 'tenant_ks', tenantClassificationPending: true },
    });
    mocks.handlerPost
      .mockReset()
      .mockResolvedValue(
        Response.json(
          { token: 'new-session-token', user: { id: 'user-1', tenantId: 'tenant_ks' } },
          { headers: { 'set-cookie': 'better-auth.session_token=signed; Path=/; HttpOnly' } }
        )
      );
    mocks.lookupTenant.mockReset().mockResolvedValue('tenant_ks');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('C07 accepts only matching creation hints without a pre-verification tenant lookup', async () => {
    const response = await POST(
      verifyRequest({
        tenantId: 'tenant_ks',
        tenantClassificationPending: true,
        role: 'admin',
        branchId: 'attacker-branch',
        memberNumber: 'attacker-member',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.lookupTenant).not.toHaveBeenCalled();
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.enforceOtpRateLimits).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'verify',
        tenantId: 'tenant_ks',
        dimensions: ['identity'],
      })
    );
    expect(mocks.enforceOtpRateLimits.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ kind: 'verify', dimensions: ['ip'] })
    );
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    const forwarded = mocks.handlerPost.mock.calls[0]?.[0] as Request;
    expect(await forwarded.json()).toEqual({
      email: 'member@example.com',
      otp: '123456',
      tenantId: 'tenant_ks',
      tenantClassificationPending: true,
    });
  });

  it('C08 rejects conflicting or malformed neutral hints generically before Better Auth', async () => {
    const response = await POST(
      verifyRequest({ tenantId: 'tenant_mk', tenantClassificationPending: false })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'OTP_UNAVAILABLE', message: 'Unable to verify' });
    expect(mocks.lookupTenant).not.toHaveBeenCalled();
    expect(mocks.handlerPost).not.toHaveBeenCalled();
    expect(mocks.enforceOtpRateLimits).toHaveBeenCalledTimes(1);
    expect(mocks.enforceOtpRateLimits).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'verify', dimensions: ['ip'] })
    );
  });
});
