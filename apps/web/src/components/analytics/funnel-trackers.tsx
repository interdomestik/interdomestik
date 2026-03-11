'use client';

import { CommercialFunnelEvents, FunnelEvents, resolveFunnelVariant } from '@/lib/analytics';
import { useEffect } from 'react';

type FunnelTrackerBaseProps = {
  tenantId?: string | null;
  locale: string;
  uiV2Enabled: boolean;
};

type FunnelActivationTrackerProps = FunnelTrackerBaseProps & {
  planId?: string | null;
};

export function FunnelLandingTracker({ tenantId, locale, uiV2Enabled }: FunnelTrackerBaseProps) {
  useEffect(() => {
    FunnelEvents.landingViewed({
      tenantId: tenantId ?? null,
      variant: resolveFunnelVariant(uiV2Enabled),
      locale,
    });
  }, [locale, tenantId, uiV2Enabled]);

  return null;
}

export function FunnelActivationTracker({
  tenantId,
  locale,
  uiV2Enabled,
  planId,
}: FunnelActivationTrackerProps) {
  useEffect(() => {
    const context = {
      tenantId: tenantId ?? null,
      variant: resolveFunnelVariant(uiV2Enabled),
      locale,
    };
    const properties = {
      ...(planId ? { plan_id: planId } : {}),
    };

    FunnelEvents.activationCompleted(context, properties);
    CommercialFunnelEvents.membershipStarted(context, properties);
  }, [locale, planId, tenantId, uiV2Enabled]);

  return null;
}
