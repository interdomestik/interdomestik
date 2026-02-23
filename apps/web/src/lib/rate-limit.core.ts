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
  /** Enforce fail-closed behavior on production-sensitive endpoints. */
  productionSensitive?: boolean;
};

// Server-action-safe variant that returns structured data instead of NextResponse
export type RateLimitResult =
  | { limited: false }
  | { limited: true; status: 429 | 503; retryAfter?: number; error: string };

let warnedMissingUpstashEnv = false;
let warnedUnavailableBackendFailOpen = false;

const RATE_LIMIT_BACKEND_MISSING_FINGERPRINT = 'RATE_LIMIT_BACKEND_MISSING';

function isAutomatedTestRun(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.CI === 'true' ||
    process.env.PLAYWRIGHT === '1' ||
    process.env.INTERDOMESTIK_AUTOMATED === '1'
  );
}

function shouldFailClosed(productionSensitive?: boolean): boolean {
  return process.env.NODE_ENV === 'production' && productionSensitive === true;
}

function emitBackendMissingTelemetry(args: {
  name: string;
  reason: 'missing_env' | 'backend_unavailable';
  error?: unknown;
}): void {
  const { name, reason, error } = args;
  const errorMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;

  console.error(`[rate-limit] ${RATE_LIMIT_BACKEND_MISSING_FINGERPRINT}`, {
    name,
    reason,
    nodeEnv: process.env.NODE_ENV,
    errorMessage,
  });
}

function serviceUnavailableResponse(windowSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'Service Unavailable' },
    {
      status: 503,
      headers: {
        'Retry-After': String(Math.max(1, windowSeconds)),
      },
    }
  );
}

function serviceUnavailableResult(windowSeconds: number): RateLimitResult {
  return {
    limited: true,
    status: 503,
    retryAfter: Math.max(1, windowSeconds),
    error: 'Service unavailable',
  };
}

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

export async function enforceRateLimit({
  name,
  limit,
  windowSeconds,
  headers,
  productionSensitive,
}: RateLimitOptions) {
  // Skip rate limiting entirely for automated test runs (Playwright, CI, etc.)
  if (isAutomatedTestRun()) {
    return null;
  }
  const failClosed = shouldFailClosed(productionSensitive);

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Treat empty strings as unset (for E2E testing)
  if (!url || url === '' || !token || token === '') {
    if (failClosed) {
      emitBackendMissingTelemetry({ name, reason: 'missing_env' });
      return serviceUnavailableResponse(windowSeconds);
    }

    if (!warnedMissingUpstashEnv) {
      warnedMissingUpstashEnv = true;
      console.warn(
        `[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set; rate limiting is DISABLED for ${name}`
      );
    }
    return null;
  }

  try {
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
  } catch (error) {
    if (failClosed) {
      emitBackendMissingTelemetry({ name, reason: 'backend_unavailable', error });
      return serviceUnavailableResponse(windowSeconds);
    }

    if (!warnedUnavailableBackendFailOpen) {
      warnedUnavailableBackendFailOpen = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[rate-limit] backend unavailable; rate limiting is DISABLED for ${name}. reason=${errorMessage}`
      );
    }
    return null;
  }
}

export async function enforceRateLimitForAction({
  name,
  limit,
  windowSeconds,
  headers,
  productionSensitive,
}: RateLimitOptions): Promise<RateLimitResult> {
  // Skip rate limiting entirely for automated test runs (Playwright, CI, etc.)
  if (isAutomatedTestRun()) {
    return { limited: false };
  }
  const failClosed = shouldFailClosed(productionSensitive);

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  // Treat empty strings as unset (for E2E testing)
  if (!url || url === '' || !token || token === '') {
    if (failClosed) {
      emitBackendMissingTelemetry({ name, reason: 'missing_env' });
      return serviceUnavailableResult(windowSeconds);
    }

    if (!warnedMissingUpstashEnv) {
      warnedMissingUpstashEnv = true;
      console.warn(
        `[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set; rate limiting is DISABLED for action: ${name}`
      );
    }
    return { limited: false };
  }

  try {
    const ratelimit = getRatelimitInstance(limit, windowSeconds);
    const ip = getClientIp(headers);
    const key = `${name}:${ip}`;
    const result = await ratelimit.limit(key);

    if (result.success) return { limited: false };

    const resetSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return { limited: true, status: 429, retryAfter: resetSeconds, error: 'Too many requests' };
  } catch (error) {
    if (failClosed) {
      emitBackendMissingTelemetry({ name, reason: 'backend_unavailable', error });
      return serviceUnavailableResult(windowSeconds);
    }

    if (!warnedUnavailableBackendFailOpen) {
      warnedUnavailableBackendFailOpen = true;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[rate-limit] backend unavailable; rate limiting is DISABLED for action: ${name}. reason=${errorMessage}`
      );
    }
    return { limited: false };
  }
}
