import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  enforceOtpRateLimits: vi.fn(),
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
      origin: 'https://ida.interdomestik.com',
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.8',
    },
    body: JSON.stringify({ email, type: 'sign-in', ...extra }),
  });
}

describe('IDA-UI03a0b2 neutral OTP send route', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', '1');
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
    vi.stubEnv('OTP_RATE_LIMIT_HMAC_SECRET', 's'.repeat(32));
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.enforceOtpRateLimits.mockReset().mockResolvedValue(null);
    mocks.handlerPost.mockReset().mockImplementation(async () => Response.json({ success: true }));
    mocks.lookupAccount.mockReset().mockResolvedValue({
      tenantId: 'tenant_ks',
      tenantClassificationPending: true,
    });
    mocks.isPublicIntakeOpen.mockReset().mockResolvedValue(false);
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
    expect(mocks.lookupAccount).toHaveBeenCalledWith('member@example.com');
    expect(mocks.isPublicIntakeOpen).not.toHaveBeenCalled();
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

    const rejected = await POST(sendRequest('member@example.com', { type: 'password-reset' }));
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ code: 'OTP_UNAVAILABLE', message: 'Unable to verify' });
    expect(mocks.handlerPost).toHaveBeenCalledTimes(1);
  });

  it('C06 gives eligible and unknown addresses the same send response when intake is closed', async () => {
    mocks.lookupAccount
      .mockResolvedValueOnce({
        tenantId: 'tenant_ks',
        tenantClassificationPending: true,
      })
      .mockResolvedValueOnce(null);
    const registered = await POST(sendRequest('registered@example.com'));
    const registeredTrace = mocks.enforceOtpRateLimits.mock.calls.map(([arg]) => arg.kind);
    mocks.enforceOtpRateLimits.mockClear();
    const unregistered = await POST(sendRequest('new@example.com'));
    const unregisteredTrace = mocks.enforceOtpRateLimits.mock.calls.map(([arg]) => arg.kind);

    expect(await registered.json()).toEqual({ success: true });
    expect(await unregistered.json()).toEqual({ success: true });
    expect(unregistered.status).toBe(registered.status);
    expect(registeredTrace).toEqual(['send', 'send']);
    expect(unregisteredTrace).toEqual(registeredTrace);
    expect(mocks.handlerPost).toHaveBeenCalledTimes(1);
    expect(mocks.isPublicIntakeOpen).toHaveBeenCalledExactlyOnceWith('tenant_ks');
  });

  it.each([
    { tenantId: 'tenant_mk', tenantClassificationPending: true },
    { tenantId: 'tenant_ks', tenantClassificationPending: false },
    { tenantId: null, tenantClassificationPending: true },
  ])(
    'does not send or consult the switch for a known ineligible account ($tenantId)',
    async account => {
      mocks.lookupAccount.mockResolvedValueOnce(account);
      const response = await POST(sendRequest('member@example.com'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      expect(mocks.handlerPost).not.toHaveBeenCalled();
      expect(mocks.isPublicIntakeOpen).not.toHaveBeenCalled();
    }
  );

  it('returns identical identity limits before looking up known or unknown addresses', async () => {
    mocks.enforceOtpRateLimits.mockImplementation(async ({ dimensions }) =>
      dimensions.includes('identity')
        ? Response.json({ code: 'RATE_LIMITED' }, { status: 429 })
        : null
    );
    const known = await POST(sendRequest('registered@example.com'));
    const unknown = await POST(sendRequest('new@example.com'));
    expect(known.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(await unknown.text()).toBe(await known.text());
    expect(mocks.lookupAccount).not.toHaveBeenCalled();
    expect(mocks.isPublicIntakeOpen).not.toHaveBeenCalled();
    expect(mocks.handlerPost).not.toHaveBeenCalled();
  });

  it('does not use the fallback door tenant when the explicit default is missing', async () => {
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', undefined);
    const response = await POST(sendRequest('registered@example.com'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.lookupAccount).not.toHaveBeenCalled();
    expect(mocks.handlerPost).not.toHaveBeenCalled();
  });
});
