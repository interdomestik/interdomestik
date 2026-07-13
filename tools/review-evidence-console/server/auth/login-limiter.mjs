import { isIP } from 'node:net';

const UNKNOWN_SOURCE = 'unknown';
const OVERFLOW_SOURCE = 'overflow';

function sourceKey(request) {
  const supplied = request.headers.get('x-vercel-forwarded-for')?.trim() ?? '';
  return isIP(supplied) ? supplied : UNKNOWN_SOURCE;
}

export function createLoginLimiter({
  limit = 5,
  windowMs = 60_000,
  maxBuckets = 1_024,
  now = Date.now,
} = {}) {
  if (
    ![limit, windowMs, maxBuckets].every(Number.isSafeInteger) ||
    limit < 1 ||
    windowMs < 1 ||
    maxBuckets < 1
  ) {
    throw new TypeError('Invalid login limiter configuration.');
  }
  const buckets = new Map();

  function prune(time) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= time) buckets.delete(key);
    }
  }

  return Object.freeze({
    consume(request) {
      const time = now();
      let key = sourceKey(request);
      if (!buckets.has(key) && buckets.size >= maxBuckets) {
        prune(time);
        if (buckets.size >= maxBuckets) key = OVERFLOW_SOURCE;
      }
      const current = buckets.get(key);
      if (!current || current.resetAt <= time) {
        buckets.set(key, { count: 1, resetAt: time + windowMs });
        return { allowed: true, retryAfter: 0 };
      }
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - time) / 1_000));
      if (current.count >= limit) return { allowed: false, retryAfter };
      current.count += 1;
      return { allowed: true, retryAfter: 0 };
    },
  });
}
