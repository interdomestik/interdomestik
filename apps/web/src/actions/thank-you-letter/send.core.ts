import { sendEmail } from '@/lib/email';
import { renderThankYouLetterEmail } from '@/lib/email/thank-you-letter';
import { buildThankYouLetterParams } from './params.core';
import type { SendThankYouLetterParams } from './types';

export async function sendThankYouLetterCore(
  params: SendThankYouLetterParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const emailContent = renderThankYouLetterEmail(buildThankYouLetterParams(params));
    const delivery = await sendEmail(params.email, emailContent);
    return delivery.success ? { success: true } : delivery;
  } catch (error) {
    console.error('[ThankYouLetter] Failed to send:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
