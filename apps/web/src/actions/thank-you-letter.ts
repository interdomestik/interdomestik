'use server';

import { previewThankYouLetterCore } from './thank-you-letter/preview';
import { resendWelcomeEmailCore } from './thank-you-letter/resend';
import { sendThankYouLetterCore } from './thank-you-letter/send';
import type {
  PreviewThankYouLetterParams,
  SendThankYouLetterParams,
} from './thank-you-letter/types';

/**
 * Send the Thank-you Letter email to a new member
 */
export async function sendThankYouLetter(params: {
  email: string;
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: Date;
  expiresAt: Date;
  locale?: 'en' | 'sq';
}): Promise<{ success: boolean; error?: string }> {
  return sendThankYouLetterCore(params satisfies SendThankYouLetterParams);
}

/**
 * Preview the Thank-you Letter HTML (for testing/admin preview)
 */
export async function previewThankYouLetter(params: {
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  locale?: 'en' | 'sq';
}): Promise<{ html: string; text: string }> {
  return previewThankYouLetterCore(params satisfies PreviewThankYouLetterParams);
}

/**
 * Admin Action: Resend Welcome Email to a user
 */
export async function resendWelcomeEmail(userId: string) {
  return resendWelcomeEmailCore(userId);
}
