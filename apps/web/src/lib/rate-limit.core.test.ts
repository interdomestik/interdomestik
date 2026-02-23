import { NextResponse } from 'next/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceRateLimit, enforceRateLimitForAction } from './rate-limit.core';

// Mock dependencies
const mockLimit = vi.fn();
vi.mock('@upstash/ratelimit', () => {
  return {
    Ratelimit: class {
      static slidingWindow = vi.fn();
      limit = mockLimit;
    },
  };
});

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(),
  },
}));

describe('rate-limit.core', () => {
  const originalEnv = process.env;
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    mockLimit.mockReset();
    warnSpy.mockClear();
    errorSpy.mockClear();
    process.env = { ...originalEnv };
    Object.assign(process.env, {
      UPSTASH_REDIS_REST_URL: 'https://mock.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'mock-token',
      NODE_ENV: 'production', // Default to production for stricter checks
      INTERDOMESTIK_AUTOMATED: '0',
    });
    // Explicitly unset automated test env vars so rate limiting actually runs
    delete process.env.CI;
    delete process.env.PLAYWRIGHT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  afterAll(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('enforceRateLimit', () => {
    const mockHeaders = new Headers();
    mockHeaders.set('x-forwarded-for', '127.0.0.1');

    it('should allow request if env vars are missing in production for non-sensitive paths', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const res = await enforceRateLimit({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      expect(res).toBeNull();
    });

    it('should fail closed with 503 for missing env on production-sensitive paths', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const res = await enforceRateLimit({
        name: 'api/auth',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
        productionSensitive: true,
      });
      expect(res?.status).toBe(503);
      expect(res?.headers.get('Retry-After')).toBe('60');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('RATE_LIMIT_BACKEND_MISSING'),
        expect.objectContaining({
          name: 'api/auth',
          reason: 'missing_env',
        })
      );
    });

    it('should allow request if env vars are missing in development', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      Object.assign(process.env, { NODE_ENV: 'development' });
      const res = await enforceRateLimit({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      expect(res).toBeNull();
    });

    it('should allow request if within limit', async () => {
      mockLimit.mockResolvedValue({
        success: true,
        limit: 10,
        remaining: 9,
        reset: Date.now() + 1000,
      });
      const res = await enforceRateLimit({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      expect(res).toBeNull();
    });

    it('should return 429 if limit exceeded', async () => {
      mockLimit.mockResolvedValue({
        success: false,
        limit: 10,
        remaining: 0,
        reset: Date.now() + 2000,
      });
      const res = await enforceRateLimit({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      expect(res).toBeInstanceOf(NextResponse);
      expect(res?.status).toBe(429);
      expect(res?.headers.get('Retry-After')).toBe('2');
    });

    it('should fail closed with 503 when backend is unavailable on production-sensitive paths', async () => {
      mockLimit.mockRejectedValue(new Error('Upstash timeout'));
      const res = await enforceRateLimit({
        name: 'api/webhooks/paddle',
        limit: 10,
        windowSeconds: 45,
        headers: mockHeaders,
        productionSensitive: true,
      });

      expect(res?.status).toBe(503);
      expect(res?.headers.get('Retry-After')).toBe('45');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('RATE_LIMIT_BACKEND_MISSING'),
        expect.objectContaining({
          name: 'api/webhooks/paddle',
          reason: 'backend_unavailable',
        })
      );
    });

    it('should resolve IP from x-real-ip if forwarded-for is missing', async () => {
      const headers = new Headers();
      headers.set('x-real-ip', '10.0.0.1');
      mockLimit.mockResolvedValue({ success: true });

      await enforceRateLimit({ name: 'test', limit: 10, windowSeconds: 60, headers });

      expect(mockLimit).toHaveBeenCalledWith(expect.stringContaining('10.0.0.1'));
    });
  });

  describe('enforceRateLimitForAction', () => {
    const mockHeaders = new Headers();
    mockHeaders.set('x-forwarded-for', '127.0.0.1');

    it('should return limited: false if env missing in production for non-sensitive actions', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const res = await enforceRateLimitForAction({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      expect(res).toEqual({ limited: false });
    });

    it('should return 503 payload when env is missing for production-sensitive actions', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const res = await enforceRateLimitForAction({
        name: 'api/register',
        limit: 10,
        windowSeconds: 30,
        headers: mockHeaders,
        productionSensitive: true,
      });

      expect(res).toEqual({
        limited: true,
        status: 503,
        retryAfter: 30,
        error: 'Service unavailable',
      });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('RATE_LIMIT_BACKEND_MISSING'),
        expect.objectContaining({
          name: 'api/register',
          reason: 'missing_env',
        })
      );
    });

    it('should return limited: false if env missing in dev', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      Object.assign(process.env, { NODE_ENV: 'development' });
      const res = await enforceRateLimitForAction({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      expect(res).toEqual({ limited: false });
    });

    it('should return limited: false if success', async () => {
      mockLimit.mockResolvedValue({ success: true });
      const res = await enforceRateLimitForAction({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      expect(res).toEqual({ limited: false });
    });

    it('should return limited: true with 429 if failure', async () => {
      mockLimit.mockResolvedValue({ success: false, reset: Date.now() + 5000 });
      const res = await enforceRateLimitForAction({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      expect(res).toEqual(expect.objectContaining({ limited: true, status: 429 }));
    });

    it('should return 503 payload when backend is unavailable for production-sensitive actions', async () => {
      mockLimit.mockRejectedValue(new Error('Upstash timeout'));
      const res = await enforceRateLimitForAction({
        name: 'api/uploads',
        limit: 10,
        windowSeconds: 25,
        headers: mockHeaders,
        productionSensitive: true,
      });

      expect(res).toEqual({
        limited: true,
        status: 503,
        retryAfter: 25,
        error: 'Service unavailable',
      });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('RATE_LIMIT_BACKEND_MISSING'),
        expect.objectContaining({
          name: 'api/uploads',
          reason: 'backend_unavailable',
        })
      );
    });
  });
});
