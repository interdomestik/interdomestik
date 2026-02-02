import { BetterAuthOptions } from 'better-auth';
import { getTrustedOrigins } from './utils';

export const authConfig = {
  baseURL: process.env.BETTER_AUTH_URL || 'http://127.0.0.1.nip.io:3000',
  trustedOrigins: getTrustedOrigins(),
  rateLimit: {
    // Contract: Rate limiting must be disabled for deterministic automated runs (Playwright/CI),
    // but remain enabled by default everywhere else.
    enabled: !(
      process.env.INTERDOMESTIK_AUTOMATED === '1' ||
      process.env.PLAYWRIGHT === '1' ||
      !!process.env.CI
    ),
    window: 60, // 1 minute
    max: 100, // 100 requests per minute per IP
  },
} satisfies Partial<BetterAuthOptions>;
