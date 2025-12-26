import { renderThankYouLetterEmail, ThankYouLetterParams } from '@/lib/email/thank-you-letter';

import { generateMemberQRCode } from './qr';
import type { PreviewThankYouLetterParams } from './types';

export async function previewThankYouLetterCore(
  params: PreviewThankYouLetterParams
): Promise<{ html: string; text: string }> {
  const qrCodeDataUrl = await generateMemberQRCode(params.memberNumber);

  const now = new Date();
  const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const dateFormatter = new Intl.DateTimeFormat(params.locale === 'sq' ? 'sq-AL' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const letterParams: ThankYouLetterParams = {
    memberName: params.memberName,
    memberNumber: params.memberNumber,
    planName: params.planName,
    planPrice: params.planPrice,
    planInterval: params.planInterval,
    memberSince: dateFormatter.format(now),
    expiresAt: dateFormatter.format(oneYear),
    qrCodeDataUrl,
    locale: params.locale || 'en',
  };

  return renderThankYouLetterEmail(letterParams);
}
