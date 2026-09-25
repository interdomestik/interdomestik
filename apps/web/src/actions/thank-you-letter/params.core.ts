import type { ThankYouLetterParams } from '@/lib/email/thank-you-letter';
import { coerceTenantId, resolveTenantAppOrigin } from '@/lib/tenant/tenant-hosts';
import { isConfirmationLocale, type PreviewThankYouLetterParams } from './types';

const DATE_LOCALES = {
  en: 'en-US',
  sq: 'sq-AL',
  mk: 'mk-MK',
  sr: 'sr-Latn-RS',
} as const;

export function buildThankYouLetterParams(
  params: PreviewThankYouLetterParams
): ThankYouLetterParams {
  if (!isConfirmationLocale(params.locale)) throw new Error('Unsupported confirmation locale');

  const tenantId = coerceTenantId(params.tenantId);
  if (!tenantId) throw new Error('Unsupported confirmation tenant');

  const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALES[params.locale], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
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
}
