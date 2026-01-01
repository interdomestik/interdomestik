import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

type RateLimitOptions = {
  /** A stable name for the protected action, e.g. "api/uploads" */
  name: string;
  /** Requests allowed per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Headers to derive client identity (IP) */
  headers: Headers;
};

let warnedMissingUpstashEnv = false;

function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
  return ip;
}

function getRatelimitInstance(limit: number, windowSeconds: number) {
  const redis = Redis.fromEnv();
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: 'interdomestik',
    analytics: true,
  });
}

export async function enforceRateLimit({ name, limit, windowSeconds, headers }: RateLimitOptions) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const isAutomatedTestRun =
    process.env.NODE_ENV === 'test' ||
    process.env.CI === 'true' ||
    process.env.INTERDOMESTIK_AUTOMATED === '1';
  const isProduction = process.env.NODE_ENV === 'production';

  if (!url || !token) {
    if (isProduction) {
      console.error(
        '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set; refusing request'
      );
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }
    if (!warnedMissingUpstashEnv && !isAutomatedTestRun) {
      warnedMissingUpstashEnv = true;
      console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set; rate limiting is disabled'
      );
    }
    return null;
  }

  const ratelimit = getRatelimitInstance(limit, windowSeconds);

  const ip = getClientIp(headers);
  const key = `${name}:${ip}`;

  const result = await ratelimit.limit(key);

  if (result.success) return null;

  const resetSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: 'Too Many Requests',
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(resetSeconds),
      },
    }
  );
}
