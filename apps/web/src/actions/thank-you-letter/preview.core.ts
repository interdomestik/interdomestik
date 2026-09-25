import { renderThankYouLetterEmail, ThankYouLetterParams } from '@/lib/email/thank-you-letter';
import type { PreviewThankYouLetterParams } from './types';

const DATE_LOCALES = {
  en: 'en-US',
  sq: 'sq-AL',
  mk: 'mk-MK',
  sr: 'sr-Latn-RS',
} as const;

export async function previewThankYouLetterCore(
  params: PreviewThankYouLetterParams
): Promise<{ html: string; text: string }> {
  const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALES[params.locale], {
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
    providerReference: params.providerReference,
    dashboardUrl: params.dashboardUrl,
    locale: params.locale,
  };

  return renderThankYouLetterEmail(letterParams);
}
