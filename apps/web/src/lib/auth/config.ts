import { BetterAuthOptions } from 'better-auth';
import { releaseClass } from '../runtime-environment';
import { getAuthBaseURL, getTrustedOrigins } from './utils';

const automationRequested =
  process.env.INTERDOMESTIK_AUTOMATED === '1' ||
  process.env.PLAYWRIGHT === '1' ||
  Boolean(process.env.CI);

export const authConfig = {
  baseURL: getAuthBaseURL(),
  trustedOrigins: getTrustedOrigins(),
  rateLimit: {
    enabled: !automationRequested || releaseClass() === 'production',
    window: 60, // 1 minute
    max: 100, // 100 requests per minute per IP
    // Sign-in email POSTs are already protected by the app route limiter, which carries
    // the pilot-safe tenant/account-aware policy. Disable better-auth's built-in
    // special rule here to avoid double-throttling canonical operator logins.
    customRules: {
      '/sign-in/email': false,
      '/sign-in/email-otp': false,
      '/email-otp/send-verification-otp': false,
    },
  },
} satisfies Partial<BetterAuthOptions>;
