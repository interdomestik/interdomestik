'use client';

import { PricingTable } from '@/components/pricing/pricing-table';
import type { EntityDisclosureNoticeModel } from '@/components/commercial/entity-disclosure-notice';
import { CommercialFunnelEvents } from '@/lib/analytics';
import { authClient } from '@/lib/auth-client';
import type { PublicBillingCheckoutConfig } from '@interdomestik/domain-membership-billing/paddle-server';
import { useLocale } from 'next-intl';
import { useEffect, useLayoutEffect, useState } from 'react';

import type { SelfServePlanId } from '@/components/pricing/pricing-table/types';

type PricingPageRuntimeProps = Readonly<{
  billingTestMode: boolean;
  billingTenantId?: string | null;
  checkoutConfig: PublicBillingCheckoutConfig | null;
  entityDisclosure?: EntityDisclosureNoticeModel | null;
  neutralEntryPlan?: SelfServePlanId | null;
  neutralPricingEntryUrl?: string;
}>;

export function PricingPageRuntime({
  billingTestMode,
  billingTenantId,
  checkoutConfig,
  entityDisclosure,
  neutralEntryPlan,
  neutralPricingEntryUrl,
}: PricingPageRuntimeProps) {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const locale = useLocale();
  const [acceptedEntryPlan, setAcceptedEntryPlan] = useState<SelfServePlanId | null>(null);

  useLayoutEffect(() => {
    if (!neutralPricingEntryUrl) return setAcceptedEntryPlan(null);
    const trustedEntry = new URL(neutralPricingEntryUrl);
    if (location.origin !== trustedEntry.origin || location.pathname !== trustedEntry.pathname) {
      return setAcceptedEntryPlan(null);
    }
    const hasPlanAttempt = new URLSearchParams(location.search).has('plan');
    if (hasPlanAttempt) history.replaceState(history.state, '', location.pathname);
    setAcceptedEntryPlan(hasPlanAttempt ? (neutralEntryPlan ?? null) : null);
  }, [neutralEntryPlan, neutralPricingEntryUrl]);

  useEffect(() => {
    CommercialFunnelEvents.pricingPageViewed(
      {
        tenantId: null,
        variant: 'hero_v1',
        locale,
      },
      {
        flow_entry: user?.id ? 'logged_in_member' : 'anonymous_public',
      }
    );
  }, [locale, user?.id]);

  return (
    <PricingTable
      billingTestMode={billingTestMode}
      checkoutConfig={checkoutConfig}
      email={user?.email}
      entityDisclosure={entityDisclosure}
      isSessionPending={isPending}
      {...(acceptedEntryPlan ? { neutralEntryPlan: acceptedEntryPlan } : {})}
      {...(neutralPricingEntryUrl ? { neutralPricingEntryUrl } : {})}
      tenantId={billingTenantId}
      userId={user?.id}
    />
  );
}
