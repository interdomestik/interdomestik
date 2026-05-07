import { PLAN_IDS } from './types';

export const FALLBACK_CHECKOUT_PRICE_IDS = {
  standardYear: 'pri_standard_year',
  familyYear: 'pri_family_year',
} as const;

export function getPaddleLocale(locale: string) {
  const normalizedLocale = locale.toLowerCase();

  if (['de', 'en', 'es', 'fr', 'it', 'nl'].includes(normalizedLocale)) {
    return normalizedLocale;
  }

  return 'en';
}

export function getSelectedPlanIdFromSearch(search: string) {
  const planFromQuery = new URLSearchParams(search).get('plan')?.trim().toLowerCase() ?? '';
  return PLAN_IDS.includes(planFromQuery as (typeof PLAN_IDS)[number]) ? planFromQuery : null;
}

export function hasUsablePaddleClientToken(clientToken: string) {
  const normalizedPaddleClientToken = clientToken.toLowerCase();

  return (
    clientToken.length > 0 &&
    !normalizedPaddleClientToken.includes('...') &&
    !normalizedPaddleClientToken.includes('***') &&
    !normalizedPaddleClientToken.includes('your_client_token_here')
  );
}

function getCheckoutAttribution(search: string) {
  const params = new URLSearchParams(search);

  const normalize = (key: string) => {
    const value = params.get(key)?.trim();
    return value || undefined;
  };

  return {
    utmSource: normalize('utm_source'),
    utmMedium: normalize('utm_medium'),
    utmCampaign: normalize('utm_campaign'),
    utmContent: normalize('utm_content'),
  };
}

export function buildCheckoutCustomData(args: {
  userId?: string;
  agentId?: string;
  tenantId?: string | null;
  search?: string;
}) {
  const attribution = getCheckoutAttribution(args.search ?? '');

  return {
    acquisitionSource: 'self_serve_web',
    ...(args.userId ? { userId: args.userId } : {}),
    ...(args.agentId ? { agentId: args.agentId } : {}),
    ...(args.tenantId ? { tenantId: args.tenantId } : {}),
    ...(attribution.utmSource ? { utmSource: attribution.utmSource } : {}),
    ...(attribution.utmMedium ? { utmMedium: attribution.utmMedium } : {}),
    ...(attribution.utmCampaign ? { utmCampaign: attribution.utmCampaign } : {}),
    ...(attribution.utmContent ? { utmContent: attribution.utmContent } : {}),
  };
}
