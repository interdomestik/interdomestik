import { resolveDeploymentOrigin } from '@interdomestik/domain-communications/deployment-origin';
import { LOCALES, type AppLocale } from '@/i18n/locales';

import type { SelfServePlanId } from '@/components/pricing/pricing-table/types';

type PricingEntryEnv = Readonly<Record<string, string | undefined>>;

type PricingSearchParams = Record<string, string | string[] | undefined> | undefined;

const SELF_SERVE_PLANS = new Set<SelfServePlanId>(['standard', 'family']);

export function buildNeutralPricingEntryUrl(
  locale: string,
  env: PricingEntryEnv = process.env
): string {
  if (!LOCALES.includes(locale as AppLocale)) throw new Error('invalid_pricing_locale');
  const origin = resolveDeploymentOrigin(env).origin;
  return `${origin}/${locale}/pricing`;
}

export function parseNeutralPricingPlan(params: PricingSearchParams): SelfServePlanId | null {
  if (!params || Object.keys(params).length !== 1 || typeof params.plan !== 'string') return null;
  return SELF_SERVE_PLANS.has(params.plan as SelfServePlanId)
    ? (params.plan as SelfServePlanId)
    : null;
}
