import { renderThankYouLetterEmail } from '@/lib/email/thank-you-letter';
import { buildThankYouLetterParams } from './params.core';
import type { PreviewThankYouLetterParams } from './types';

export async function previewThankYouLetterCore(
  params: PreviewThankYouLetterParams
): Promise<{ html: string; text: string }> {
  return renderThankYouLetterEmail(buildThankYouLetterParams(params));
}
