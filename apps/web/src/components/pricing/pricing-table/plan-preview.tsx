'use client';

import { authClient } from '@/lib/auth-client';
import { useLocale, useTranslations } from 'next-intl';
import { FALLBACK_CHECKOUT_PRICE_IDS } from './checkout-helpers';
import { PricingPlanGrid } from './plan-grid';
import { buildPricingPlans } from './plan-model';
import { SponsorCheckoutNotice } from './sponsor-checkout-notice';
import { useSponsorCheckoutNotice } from './use-sponsor-checkout-notice';

export function PricingPlanPreview() {
  const t = useTranslations('pricing');
  const locale = useLocale();
  const { data: session } = authClient.useSession();
  const { notice } = useSponsorCheckoutNotice(session?.user.id);
  const plans = buildPricingPlans({
    t,
    priceIds: { ...FALLBACK_CHECKOUT_PRICE_IDS, businessYear: null },
  });
  return (
    <div className="space-y-6">
      {notice && <SponsorCheckoutNotice notice={notice} locale={locale} t={t} />}
      <PricingPlanGrid
        plans={plans}
        selectedPlanId={null}
        loadingPriceId={null}
        isPilotMode={false}
        isSessionPending={false}
        t={t}
      />
    </div>
  );
}
