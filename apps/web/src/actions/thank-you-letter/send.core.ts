import { sendEmail } from '@/lib/email';
import { renderThankYouLetterEmail, ThankYouLetterParams } from '@/lib/email/thank-you-letter';

import { generateMemberQRCode } from './qr';
import type { SendThankYouLetterParams } from './types';

export async function sendThankYouLetterCore(
  params: SendThankYouLetterParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const qrCodeDataUrl = await generateMemberQRCode(params.memberNumber);

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
      memberSince: dateFormatter.format(params.memberSince),
      expiresAt: dateFormatter.format(params.expiresAt),
      qrCodeDataUrl,
      locale: params.locale || 'en',
    };

    const emailContent = renderThankYouLetterEmail(letterParams);

    const { generateThankYouPDF } = await import('@/lib/pdf/thank-you-letter');
    const pdfBuffer = await generateThankYouPDF(letterParams);

    await sendEmail(
      params.email,
      {
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      },
      {
        attachments: [
          {
            filename: `Interdomestik-Membership-${params.memberNumber}.pdf`,
            content: pdfBuffer,
          },
        ],
      }
    );

    console.log(`[ThankYouLetter] Sent to ${params.email} (${params.memberNumber})`);
    return { success: true };
  } catch (error) {
    console.error('[ThankYouLetter] Failed to send:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
