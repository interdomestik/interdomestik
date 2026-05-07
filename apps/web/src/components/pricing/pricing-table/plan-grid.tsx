'use client';

import { shouldRenderBusinessMembershipLink } from './pricing-decisions';
import { getPlanColorClass } from './plan-model';
import { PlanCard } from './plan-card';
import type { PricingPlanGridProps } from './types';

export function PricingPlanGrid({
  plans,
  selectedPlanId,
  loadingPriceId,
  isPilotMode,
  isSessionPending,
  t,
  onPlanCtaClick,
}: PricingPlanGridProps) {
  return (
    <div className="grid gap-10 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 max-w-7xl mx-auto px-4">
      {plans.map(plan => {
        const renderBusinessMembershipLink = shouldRenderBusinessMembershipLink({
          planId: plan.id,
          isPilotMode,
          isSessionPending,
        });

        return (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={selectedPlanId === plan.id}
            loading={loadingPriceId === plan.priceId}
            disabled={
              isPilotMode ||
              isSessionPending ||
              (plan.priceId !== null && loadingPriceId === plan.priceId)
            }
            renderBusinessMembershipLink={renderBusinessMembershipLink}
            colorClass={getPlanColorClass(plan.color)}
            billedAnnuallyLabel={t('billedAnnually')}
            popularLabel={t('standard.popular')}
            ctaLabel={t('cta')}
            onClick={() => onPlanCtaClick(plan)}
          />
        );
      })}
    </div>
  );
}
