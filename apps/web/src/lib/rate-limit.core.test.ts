import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  beforeEach(() => {
    vi.resetModules();
    mockLimit.mockReset();
    process.env = { ...originalEnv };
    Object.assign(process.env, {
      UPSTASH_REDIS_REST_URL: 'https://mock.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'mock-token',
      NODE_ENV: 'production', // Default to production for stricter checks
      INTERDOMESTIK_AUTOMATED: '0',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('enforceRateLimit', () => {
    const mockHeaders = new Headers();
    mockHeaders.set('x-forwarded-for', '127.0.0.1');

    it('should allow request if env vars are missing in production (fail-open)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      const res = await enforceRateLimit({
        name: 'test',
        limit: 10,
        windowSeconds: 60,
        headers: mockHeaders,
      });
      // Now expects null (allowed) instead of 503
      expect(res).toBeNull();
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

    it('should return limited: false if env missing in production (fail-open)', async () => {
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
  });
});
