import { Building2, ShieldCheck, Users } from 'lucide-react';

import type { PricingPlan, ResolvedCheckoutPriceIds, TranslateFn } from './types';

export function findPlanById<TPlan extends { id: string }>(
  plans: readonly TPlan[],
  planId: string | null
): TPlan | null {
  return planId ? (plans.find(plan => plan.id === planId) ?? null) : null;
}

export function getPlanColorClass(color: string) {
  if (color === 'blue') return 'bg-blue-50 text-blue-600';
  if (color === 'purple') return 'bg-purple-50 text-purple-600';
  return 'bg-indigo-50 text-indigo-600';
}

export function buildPricingPlans(args: {
  t: TranslateFn;
  priceIds: ResolvedCheckoutPriceIds;
}): PricingPlan[] {
  const { t, priceIds } = args;

  return [
    {
      id: 'standard',
      priceId: priceIds.standardYear,
      name: t('standard.name'),
      price: '€20',
      period: t('standard.period'),
      description: t('standard.description'),
      features: [
        t('standard.features.0'),
        t('standard.features.1'),
        t('standard.features.2'),
        t('standard.features.3'),
        t('standard.features.4'),
        t('standard.features.5'),
      ],
      popular: true,
      icon: ShieldCheck,
      color: 'indigo',
    },
    {
      id: 'family',
      priceId: priceIds.familyYear,
      name: t('family.name'),
      price: '€35',
      period: t('family.period'),
      description: t('family.description'),
      features: [
        t('family.features.0'),
        t('family.features.1'),
        t('family.features.2'),
        t('family.features.3'),
      ],
      popular: false,
      icon: Users,
      color: 'purple',
    },
    {
      id: 'business',
      priceId: priceIds.businessYear,
      name: t('business.name'),
      price: '€95',
      period: t('business.period'),
      description: t('business.description'),
      features: [
        t('business.features.0'),
        t('business.features.1'),
        t('business.features.2'),
        t('business.features.3'),
        t('business.features.4'),
      ],
      popular: false,
      icon: Building2,
      color: 'blue',
    },
  ];
}
