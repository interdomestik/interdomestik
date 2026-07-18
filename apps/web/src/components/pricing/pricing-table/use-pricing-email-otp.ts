'use client';

import { useNeutralEmailOtp } from '@/components/auth/use-neutral-email-otp';

import type { PricingEmailOtpArgs } from './types';

export function usePricingEmailOtp(args: PricingEmailOtpArgs) {
  return useNeutralEmailOtp({ ...args, retryVerifiedIntent: false });
}
