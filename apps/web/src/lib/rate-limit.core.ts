import { NextResponse } from 'next/server';
import {
  buildRateLimitKey,
  createRatelimit,
  emitRateLimitBackendTelemetry,
  type RateLimitKeyMode,
} from './rate-limit-upstash';

export type RateLimitOptions = {
  /** A stable name for the protected action, e.g. "api/uploads" */
  name: string;
  /** Requests allowed per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Headers to derive client identity (IP) */
  headers: Headers;
  /** Optional suffix to disambiguate identities that share one source IP. */
  keySuffix?: string | null;
  /** Key composition; generic callers retain the existing suffix+IP default. */
  keyMode?: RateLimitKeyMode;
  /** Upstash analytics defaults on; identity-sensitive OTP callers disable it. */
  analytics?: boolean;
  /** Omit backend exception text from security-sensitive telemetry. */
  contentFreeTelemetry?: boolean;
  /** Enforce fail-closed behavior on production-sensitive endpoints. */
  productionSensitive?: boolean;
};

// Server-action-safe variant that returns structured data instead of NextResponse
export type RateLimitResult =
  { limited: false } | { limited: true; status: 429 | 503; retryAfter?: number; error: string };

let warnedMissingUpstashEnv = false;
let warnedUnavailableBackendFailOpen = false;

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

export async function enforceRateLimit({
  name,
  limit,
  windowSeconds,
  headers,
  keySuffix,
  keyMode,
  analytics,
  contentFreeTelemetry,
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
      emitRateLimitBackendTelemetry({
        name,
        reason: 'missing_env',
        contentFree: contentFreeTelemetry,
      });
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
    const ratelimit = createRatelimit(limit, windowSeconds, analytics);
    const key = buildRateLimitKey({ name, headers, keySuffix, keyMode });

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
      emitRateLimitBackendTelemetry({
        name,
        reason: 'backend_unavailable',
        error,
        contentFree: contentFreeTelemetry,
      });
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
  keySuffix,
  keyMode,
  analytics,
  contentFreeTelemetry,
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
      emitRateLimitBackendTelemetry({
        name,
        reason: 'missing_env',
        contentFree: contentFreeTelemetry,
      });
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
    const ratelimit = createRatelimit(limit, windowSeconds, analytics);
    const key = buildRateLimitKey({ name, headers, keySuffix, keyMode });
    const result = await ratelimit.limit(key);

    if (result.success) return { limited: false };

    const resetSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return { limited: true, status: 429, retryAfter: resetSeconds, error: 'Too many requests' };
  } catch (error) {
    if (failClosed) {
      emitRateLimitBackendTelemetry({
        name,
        reason: 'backend_unavailable',
        error,
        contentFree: contentFreeTelemetry,
      });
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
