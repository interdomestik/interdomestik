import { sendEmail } from '@/lib/email';
import { renderThankYouLetterEmail, ThankYouLetterParams } from '@/lib/email/thank-you-letter';
import { coerceTenantId, resolveTenantAppOrigin } from '@/lib/tenant/tenant-hosts';
import type { SendThankYouLetterParams } from './types';

const DATE_LOCALES = {
  en: 'en-US',
  sq: 'sq-AL',
  mk: 'mk-MK',
  sr: 'sr-Latn-RS',
} as const;

export async function sendThankYouLetterCore(
  params: SendThankYouLetterParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = coerceTenantId(params.tenantId);
    if (!tenantId) return { success: false, error: 'Unsupported confirmation tenant' };

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
      dashboardUrl: new URL(
        `/${params.locale}/member/membership`,
        resolveTenantAppOrigin(tenantId)
      ).toString(),
      locale: params.locale,
    };

    const emailContent = renderThankYouLetterEmail(letterParams);
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
