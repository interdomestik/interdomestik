'use client';

import { PricingTable } from '@/components/pricing/pricing-table';
import { CommercialFunnelEvents } from '@/lib/analytics';
import { authClient } from '@/lib/auth-client';
import type { PublicBillingCheckoutConfig } from '@interdomestik/domain-membership-billing/paddle-server';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';

type PricingPageRuntimeProps = Readonly<{
  billingTestMode: boolean;
  billingTenantId?: string | null;
  checkoutConfig: PublicBillingCheckoutConfig | null;
}>;

export function PricingPageRuntime({
  billingTestMode,
  billingTenantId,
  checkoutConfig,
}: PricingPageRuntimeProps) {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const locale = useLocale();

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
      isSessionPending={isPending}
      tenantId={billingTenantId}
      userId={user?.id}
    />
  );
}
