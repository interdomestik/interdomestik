import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ constructors: [] as unknown[], limit: vi.fn() }));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    limit = mocks.limit;
    constructor(options: unknown) {
      mocks.constructors.push(options);
    }
  },
}));
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: vi.fn(() => ({})) } }));

import {
  buildOtpIdentityKey,
  enforceOtpRateLimits,
  getOtpRateLimitPolicies,
  resolveOtpClientIp,
} from './rate-limit-otp';

describe('IDA-UI03a0b2 OTP abuse limits', () => {
  beforeEach(() => vi.stubEnv('CI', 'false'));
  afterEach(() => {
    mocks.constructors.length = 0;
    mocks.limit.mockReset();
    vi.unstubAllEnvs();
  });
  async function exercise(kind: 'send' | 'verify') {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://mock.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'mock-token');
    mocks.limit.mockResolvedValue({ success: true });
    await enforceOtpRateLimits({
      kind,
      tenantId: 'tenant_ks',
      email: 'Member@Example.com',
      secret: 's'.repeat(32),
      headers: new Headers({ 'x-forwarded-for': '203.0.113.10' }),
    });
    return mocks.limit.mock.calls.map(([key]) => key);
  }

  it('C13 applies independent 3/IP/60s and 3/HMAC-email/60s send budgets', async () => {
    expect(getOtpRateLimitPolicies('send')).toEqual([
      { dimension: 'ip', limit: 3, windowSeconds: 60 },
      { dimension: 'identity', limit: 3, windowSeconds: 60 },
    ]);
    expect(await exercise('send')).toEqual([
      'api/auth/otp/send:ip:203.0.113.10',
      'api/auth/otp/send:identity:ad22b349e1ba090922697667684d22ab04b2eb5ed59caf6325dabf75922f5882',
    ]);
    expect(mocks.constructors).toEqual([
      expect.objectContaining({ analytics: false, limiter: { limit: 3, window: '60 s' } }),
      expect.objectContaining({ analytics: false, limiter: { limit: 3, window: '60 s' } }),
    ]);
  });

  it('C14 applies independent 3/IP/10s and 3/HMAC-email/10s verify budgets', async () => {
    expect(getOtpRateLimitPolicies('verify')).toEqual([
      { dimension: 'ip', limit: 3, windowSeconds: 10 },
      { dimension: 'identity', limit: 3, windowSeconds: 10 },
    ]);
    expect(await exercise('verify')).toEqual([
      'api/auth/otp/verify:ip:203.0.113.10',
      'api/auth/otp/verify:identity:ad22b349e1ba090922697667684d22ab04b2eb5ed59caf6325dabf75922f5882',
    ]);
    expect(mocks.constructors).toEqual([
      expect.objectContaining({ analytics: false, limiter: { limit: 3, window: '10 s' } }),
      expect.objectContaining({ analytics: false, limiter: { limit: 3, window: '10 s' } }),
    ]);
  });

  it('C15 HMACs tenant NUL lowercase email and disables identity analytics', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://mock.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'mock-token');
    mocks.limit.mockResolvedValue({ success: true });
    const secret = 's'.repeat(32);
    const key = buildOtpIdentityKey({
      secret,
      tenantId: 'tenant_ks',
      email: 'Member@Example.com',
    });
    expect(key).toBe('ad22b349e1ba090922697667684d22ab04b2eb5ed59caf6325dabf75922f5882');
    expect(
      buildOtpIdentityKey({ secret, tenantId: 'tenant_ks', email: ' member@example.com ' })
    ).toBe(key);
    expect(key).not.toContain('member@example.com');

    await enforceOtpRateLimits({
      kind: 'send',
      tenantId: 'tenant_ks',
      email: 'Member@Example.com',
      secret,
      headers: new Headers({ 'x-forwarded-for': '203.0.113.10' }),
    });
    expect(mocks.constructors).toEqual(
      expect.arrayContaining([expect.objectContaining({ analytics: false })])
    );
  });

  it('C16 validates forwarded IP and fails closed with content-free 503 plus Retry-After', async () => {
    expect(resolveOtpClientIp(new Headers({ 'x-forwarded-for': 'bad, 203.0.113.11' }), true)).toBe(
      '203.0.113.11'
    );
    expect(resolveOtpClientIp(new Headers({ 'x-real-ip': '203.0.113.12' }), true)).toBeNull();
    expect(resolveOtpClientIp(new Headers({ 'x-real-ip': '203.0.113.12' }), false)).toBe(
      '203.0.113.12'
    );

    vi.stubEnv('NODE_ENV', 'production');
    const response = await enforceOtpRateLimits({
      kind: 'verify',
      tenantId: 'tenant_ks',
      email: 'member@example.com',
      secret: '',
      headers: new Headers(),
    });
    expect(response?.status).toBe(503);
    expect(response?.headers.get('Retry-After')).toBe('10');
    expect(await response?.json()).toEqual({ error: 'Service Unavailable' });

    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://mock.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'mock-token');
    vi.stubEnv('BETTER_AUTH_SECRET', 's'.repeat(32));
    const reusedSecret = await enforceOtpRateLimits({
      kind: 'verify',
      tenantId: 'tenant_ks',
      email: 'member@example.com',
      secret: 's'.repeat(32),
      headers: new Headers({ 'x-forwarded-for': '203.0.113.13' }),
    });
    expect(reusedSecret?.status).toBe(503);
    expect(mocks.constructors).toHaveLength(0);

    vi.stubEnv('BETTER_AUTH_SECRET', 'a'.repeat(32));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.limit.mockRejectedValueOnce(new Error('RAW_UPSTASH_DETAIL'));
    const backendFailure = await enforceOtpRateLimits({
      kind: 'verify',
      tenantId: 'tenant_ks',
      email: 'member@example.com',
      secret: 's'.repeat(32),
      headers: new Headers({ 'x-forwarded-for': '203.0.113.13' }),
    });
    expect(backendFailure?.status).toBe(503);
    expect(JSON.stringify(error.mock.calls)).not.toContain('RAW_UPSTASH_DETAIL');
    error.mockRestore();
  });
});
