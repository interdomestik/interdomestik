import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceOtpRateLimits: vi.fn(),
  getSession: vi.fn(),
  handlerPost: vi.fn(),
  lookupAccount: vi.fn(),
  isPublicIntakeOpen: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('@/lib/rate-limit-otp', () => ({
  enforceOtpRateLimits: mocks.enforceOtpRateLimits,
}));
vi.mock('@/lib/auth/tenant-lookup', () => ({
  lookupNeutralOtpAccountByEmail: mocks.lookupAccount,
}));
vi.mock('@/lib/tenant/public-intake-admission', () => ({
  isPublicIntakeOpenForTenant: mocks.isPublicIntakeOpen,
}));
vi.mock('@interdomestik/database', () => ({ appendAnonymousTenantAuditEvent: vi.fn() }));
vi.mock('@/lib/audit.core', () => ({
  extractRequestMetadata: (headers: Headers) => ({
    ip: headers.get('x-forwarded-for') ?? undefined,
    userAgent: headers.get('user-agent') ?? undefined,
  }),
}));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: mocks.getSession, revokeSession: vi.fn() } },
}));
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ GET: vi.fn(), POST: mocks.handlerPost }),
}));

import { POST } from './route';

function verifyRequest(body: Record<string, unknown>, origin = 'https://ida.interdomestik.com') {
  const request = new Request('https://ida.interdomestik.com/api/auth/sign-in/email-otp', {
    method: 'POST',
    headers: {
      host: 'ida.interdomestik.com',
      origin,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
    },
    body: JSON.stringify({ email: 'member@example.com', otp: '123456', ...body }),
  });
  if (!origin) request.headers.delete('origin');
  return request;
}

describe('IDA-UI03a0b2 neutral OTP verify route', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', '1');
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
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
    mocks.lookupAccount.mockReset().mockResolvedValue({
      tenantId: 'tenant_ks',
      tenantClassificationPending: true,
    });
    mocks.isPublicIntakeOpen.mockReset().mockResolvedValue(false);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('C07 checks a known eligible account after both limits and forwards only matching hints', async () => {
    const response = await POST(
      verifyRequest({
        onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
        role: 'admin',
        branchId: 'attacker-branch',
        memberNumber: 'attacker-member',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.lookupAccount).toHaveBeenCalledWith('member@example.com');
    expect(mocks.isPublicIntakeOpen).not.toHaveBeenCalled();
    expect(mocks.enforceOtpRateLimits.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.lookupAccount.mock.invocationCallOrder[0]
    );
    expect(mocks.lookupAccount).toHaveBeenCalledBefore(mocks.handlerPost);
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
      onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
    });
  });

  it('C08 rejects conflicting or malformed neutral hints generically before Better Auth', async () => {
    const responses = await Promise.all([
      POST(verifyRequest({ onboarding: { tenant: 'tenant_mk', mode: 'resolved' } })),
      POST(
        verifyRequest({
          otp: undefined,
          onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
        })
      ),
      POST(
        verifyRequest({
          otp: '   ',
          onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
        })
      ),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: 'OTP_UNAVAILABLE',
        message: 'Unable to verify',
      });
    }
    expect(mocks.lookupAccount).not.toHaveBeenCalled();
    expect(mocks.handlerPost).not.toHaveBeenCalled();
    expect(mocks.enforceOtpRateLimits).toHaveBeenCalledTimes(3);
    for (const [input] of mocks.enforceOtpRateLimits.mock.calls) {
      expect(input).toEqual(expect.objectContaining({ kind: 'verify', dimensions: ['ip'] }));
    }
  });

  it('C09 rejects missing and untrusted origins before rate limits or Better Auth', async () => {
    const body = { onboarding: { tenant: 'tenant_ks', mode: 'deferred' } };
    const responses = await Promise.all([
      POST(verifyRequest(body, '')),
      POST(verifyRequest(body, 'https://attacker.example')),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        code: 'OTP_UNAVAILABLE',
        message: 'Unable to verify',
      });
    }
    expect(mocks.enforceOtpRateLimits).not.toHaveBeenCalled();
    expect(mocks.handlerPost).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { tenantId: 'tenant_mk', tenantClassificationPending: true },
    { tenantId: 'tenant_ks', tenantClassificationPending: false },
    { tenantId: null, tenantClassificationPending: true },
  ])(
    'returns INVALID_OTP without Better Auth for a closed or ineligible account (%j)',
    async account => {
      mocks.lookupAccount.mockResolvedValueOnce(account);
      const response = await POST(
        verifyRequest({ onboarding: { tenant: 'tenant_ks', mode: 'deferred' } })
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: 'INVALID_OTP', message: 'Invalid OTP' });
      expect(mocks.handlerPost).not.toHaveBeenCalled();
      expect(mocks.getSession).not.toHaveBeenCalled();
      if (!account) expect(mocks.isPublicIntakeOpen).toHaveBeenCalledExactlyOnceWith('tenant_ks');
      else expect(mocks.isPublicIntakeOpen).not.toHaveBeenCalled();
    }
  );

  it('throttles verify before looking up the account or calling Better Auth', async () => {
    mocks.enforceOtpRateLimits.mockImplementation(async ({ dimensions }) =>
      dimensions.includes('identity')
        ? Response.json({ code: 'RATE_LIMITED' }, { status: 429 })
        : null
    );
    const response = await POST(
      verifyRequest({ onboarding: { tenant: 'tenant_ks', mode: 'deferred' } })
    );
    expect(response.status).toBe(429);
    expect(mocks.lookupAccount).not.toHaveBeenCalled();
    expect(mocks.handlerPost).not.toHaveBeenCalled();
  });
});
