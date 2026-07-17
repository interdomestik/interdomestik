import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type RateLimitKeyMode = 'ip' | 'suffix' | 'suffix-and-ip';
const BACKEND_MISSING = 'RATE_LIMIT_BACKEND_MISSING';

export function emitRateLimitBackendTelemetry(args: {
  name: string;
  reason: 'missing_env' | 'backend_unavailable';
  error?: unknown;
  contentFree?: boolean;
}): void {
  const { name, reason, error, contentFree } = args;
  const errorMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : undefined;
  console.error(`[rate-limit] ${BACKEND_MISSING}`, {
    name,
    reason,
    nodeEnv: process.env.NODE_ENV,
    ...(!contentFree && errorMessage ? { errorMessage } : {}),
  });
}

export function createRatelimit(limit: number, windowSeconds: number, analytics = true): Ratelimit {
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix: 'interdomestik',
    analytics,
  });
}

function genericClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown'
  );
}

export function buildRateLimitKey(args: {
  name: string;
  headers: Headers;
  keySuffix?: string | null;
  keyMode?: RateLimitKeyMode;
}): string {
  const { name, headers, keySuffix, keyMode = 'suffix-and-ip' } = args;
  const suffix = typeof keySuffix === 'string' ? keySuffix.trim() : '';
  const ip = genericClientIp(headers);
  if (keyMode === 'suffix' && suffix) return `${name}:${suffix}`;
  if (keyMode === 'ip' || !suffix) return `${name}:${ip}`;
  return `${name}:${suffix}:ip:${ip}`;
}
