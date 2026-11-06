import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceRateLimit, enforceRateLimitForAction } from './rate-limit.core';

// Upstash resolves a backend timeout as `{ success: true, reason: 'timeout' }`, not as a rejection.
// These cases mock that RESOLVED shape: a timeout is a backend failure, never an allow decision,
// on production-sensitive paths.

const upstash = vi.hoisted(() => ({ limit: vi.fn() }));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: Object.assign(
    function Ratelimit() {
      return { limit: upstash.limit };
    },
    { slidingWindow: () => ({}) }
  ),
}));
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => ({}) } }));

type Outcome = 'allowed' | 'limited' | 'unavailable';

async function viaHttp(productionSensitive: boolean, contentFreeTelemetry = false) {
  const response = await enforceRateLimit({
    name: 'api/uploads',
    limit: 5,
    windowSeconds: 30,
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    productionSensitive,
    contentFreeTelemetry,
  });
  if (response === null) return { outcome: 'allowed' as Outcome };
  const outcome: Outcome = response.status === 503 ? 'unavailable' : 'limited';
  return { outcome, status: response.status, retryAfter: response.headers.get('Retry-After') };
}

async function viaAction(productionSensitive: boolean, contentFreeTelemetry = false) {
  const result = await enforceRateLimitForAction({
    name: 'action/claims-submit',
    limit: 5,
    windowSeconds: 30,
    headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
    productionSensitive,
    contentFreeTelemetry,
  });
  if (!result.limited) return { outcome: 'allowed' as Outcome };
  const outcome: Outcome = result.status === 503 ? 'unavailable' : 'limited';
  return { outcome, status: result.status, retryAfter: String(result.retryAfter) };
}

const WRAPPERS = [
  ['HTTP', viaHttp],
  ['server action', viaAction],
] as const;

describe.each(WRAPPERS)('%s rate limit on a resolved Upstash timeout', (_label, run) => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  beforeEach(() => {
    upstash.limit.mockReset();
    errorSpy.mockClear();
    warnSpy.mockClear();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CI', 'false');
    vi.stubEnv('PLAYWRIGHT', '0');
    vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const timeout = { success: true, reason: 'timeout', limit: 5, remaining: 5, reset: 0 };

  it('fails closed with 503 and Retry-After on a production-sensitive path', async () => {
    upstash.limit.mockResolvedValue(timeout);

    await expect(run(true)).resolves.toEqual({
      outcome: 'unavailable',
      status: 503,
      retryAfter: '30',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('RATE_LIMIT_BACKEND_MISSING'),
      expect.objectContaining({ reason: 'backend_unavailable' })
    );
  });

  it('keeps the timeout out of content-free telemetry', async () => {
    upstash.limit.mockResolvedValue(timeout);

    await run(true, true);

    const [, payload] = errorSpy.mock.calls[0] ?? [];
    expect(payload).not.toHaveProperty('errorMessage');
  });

  it('keeps the existing fail-open policy off production-sensitive paths', async () => {
    upstash.limit.mockResolvedValue(timeout);

    await expect(run(false)).resolves.toEqual({ outcome: 'allowed' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps the existing fail-open policy outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    upstash.limit.mockResolvedValue(timeout);

    await expect(run(true)).resolves.toEqual({ outcome: 'allowed' });
  });

  it('still allows a real allow decision', async () => {
    upstash.limit.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 0 });

    await expect(run(true)).resolves.toEqual({ outcome: 'allowed' });
  });

  it('still answers a cache block with 429', async () => {
    upstash.limit.mockResolvedValue({
      success: false,
      reason: 'cacheBlock',
      limit: 5,
      remaining: 0,
      reset: Date.now() + 4_000,
    });

    const result = await run(true);

    expect(result).toMatchObject({ outcome: 'limited', status: 429 });
  });
});
