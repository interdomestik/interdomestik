import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authConfig } from '@/lib/auth/config';
import { getAuthRateLimitConfig } from '../[...all]/_core';
import { GET as canonicalGET } from '../[...all]/route';
import { GET as loginSessionGET } from './route';

/**
 * Enabled-provider limiter integration.
 *
 * The login-only endpoint must traverse the provider's own router limiter, not just the
 * application one, so this suite runs the real `betterAuth` router over a memory adapter with the
 * production `rateLimit` policy forced on. Automated runs disable that policy by configuration,
 * which is exactly why mocking the catch-all or the limiter algorithm cannot prove this boundary.
 */
// Hoisted so the `@/lib/auth` factory, which runs while the catch-all is imported, can read it.
const FIXTURE_BASE_URL = vi.hoisted(() => 'https://app.interdomestik.test');
const PROVIDER_MAX = authConfig.rateLimit.max;
const CANONICAL_PATH = '/api/auth/get-session';

const mocks = vi.hoisted(() => ({
  applicationLimit: vi.fn(),
  audit: vi.fn(),
  otpLimit: vi.fn(),
  providerHandler: vi.fn(),
  tenantLookup: vi.fn(),
}));

// Only the application limiter seam, the database and the POST-only audit/lookup/OTP branches are
// replaced. The provider router, its limiter, `toNextJsHandler`, the catch-all GET and the
// login-only GET all run for real.
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: mocks.applicationLimit,
  enforceRateLimitForAction: vi.fn(),
}));
vi.mock('@/lib/rate-limit-otp', () => ({ enforceOtpRateLimits: mocks.otpLimit }));
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('@/lib/auth/tenant-lookup', () => ({ lookupUserTenantByEmail: mocks.tenantLookup }));
vi.mock('../[...all]/neutral-otp-route', () => ({ handleNeutralOtpPost: vi.fn() }));
vi.mock('@interdomestik/database', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  db: { select: vi.fn() },
  userRoles: {
    id: 'id',
    userId: 'userId',
    tenantId: 'tenantId',
    role: 'role',
    branchId: 'branchId',
  },
}));
vi.mock('@/lib/auth', () => ({ auth: createFixtureAuth() }));

/** The real provider instance: production rate-limit policy, forced on, over memory only. */
function createFixtureAuth() {
  const instance = betterAuth({
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    baseURL: FIXTURE_BASE_URL,
    database: memoryAdapter({}),
    rateLimit: { ...authConfig.rateLimit, enabled: true, storage: 'memory' },
    secret: 'provider-rate-limit-fixture-secret-0123456789',
    telemetry: { enabled: false },
  });
  mocks.providerHandler.mockImplementation((request: Request) => instance.handler(request));

  return { ...instance, handler: mocks.providerHandler };
}

function anonymousRequest(path: string, clientIp: string): Request {
  return new Request(`${FIXTURE_BASE_URL}${path}`, {
    headers: { 'x-forwarded-for': clientIp, 'x-forwarded-host': 'app.interdomestik.test' },
  });
}

const canonicalRead = (clientIp: string) =>
  canonicalGET(anonymousRequest(CANONICAL_PATH, clientIp));
const loginSessionRead = (clientIp: string) =>
  loginSessionGET(anonymousRequest('/api/auth/login-session', clientIp));

describe('enabled provider limiter across the login-only session boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applicationLimit.mockResolvedValue(null);
  });

  it('shares one real provider bucket between the canonical and login-only reads', async () => {
    const clientIp = '203.0.113.11';

    for (let attempt = 1; attempt <= PROVIDER_MAX; attempt += 1) {
      const response =
        attempt % 2 === 1 ? await loginSessionRead(clientIp) : await canonicalRead(clientIp);
      expect(response.status).toBe(200);
    }

    // Both arms reached the provider on the one canonical path, so they consumed one bucket.
    const providerPaths = mocks.providerHandler.mock.calls.map(
      call => new URL((call[0] as Request).url).pathname
    );
    expect(mocks.providerHandler).toHaveBeenCalledTimes(PROVIDER_MAX);
    expect([...new Set(providerPaths)]).toEqual([CANONICAL_PATH]);

    const deniedLoginSession = await loginSessionRead(clientIp);
    expect(deniedLoginSession.status).toBe(429);
    expect(deniedLoginSession.statusText).toBe('Too Many Requests');
    expect(deniedLoginSession.headers.get('X-Retry-After')).not.toBeNull();
    expect(await deniedLoginSession.json()).toEqual({
      message: 'Too many requests. Please try again later.',
    });

    const deniedCanonical = await canonicalRead(clientIp);
    expect(deniedCanonical.status).toBe(429);
    expect(mocks.providerHandler).toHaveBeenCalledTimes(PROVIDER_MAX + 2);
  });

  it('keeps a distinct client address on its own provider bucket', async () => {
    const exhausted = '203.0.113.12';
    for (let attempt = 1; attempt <= PROVIDER_MAX; attempt += 1) {
      expect((await loginSessionRead(exhausted)).status).toBe(200);
    }

    expect((await loginSessionRead(exhausted)).status).toBe(429);
    expect((await loginSessionRead('203.0.113.13')).status).toBe(200);
  });

  it('runs the application session check on the canonical path before the provider', async () => {
    await loginSessionRead('203.0.113.14');

    expect(mocks.applicationLimit).toHaveBeenCalledOnce();
    const config = mocks.applicationLimit.mock.calls[0]?.[0];
    expect(config).toMatchObject({
      ...getAuthRateLimitConfig('GET', `${FIXTURE_BASE_URL}${CANONICAL_PATH}`),
      productionSensitive: true,
    });
    expect(config.name).toBe('api/auth/get-session');
    expect(config.limit).toBe(180);
    expect(config.windowSeconds).toBe(60);
    expect(mocks.applicationLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.providerHandler.mock.invocationCallOrder[0]!
    );
  });

  it.each([429, 503])(
    'forwards an application %s denial without reaching the provider',
    async status => {
      const denial = new Response(JSON.stringify({ code: 'RATE_LIMITED' }), {
        headers: { 'retry-after': '60' },
        status,
      });
      mocks.applicationLimit.mockResolvedValueOnce(denial);

      const response = await loginSessionRead('203.0.113.15');

      expect(response).toBe(denial);
      expect(response.status).toBe(status);
      expect(response.bodyUsed).toBe(false);
      expect(mocks.providerHandler).not.toHaveBeenCalled();
    }
  );
});
