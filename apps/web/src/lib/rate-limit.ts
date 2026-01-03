// Thin wrapper to keep import path stable while implementation lives in `./rate-limit.core`.
import { enforceRateLimit, enforceRateLimitForAction } from './rate-limit.core';
export { enforceRateLimit, enforceRateLimitForAction };
