'use client';

import { FunnelEvents, resolveFunnelVariant } from '@/lib/analytics';
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
    FunnelEvents.activationCompleted(
      {
        tenantId: tenantId ?? null,
        variant: resolveFunnelVariant(uiV2Enabled),
        locale,
      },
      {
        ...(planId ? { plan_id: planId } : {}),
      }
    );
  }, [locale, planId, tenantId, uiV2Enabled]);

  return null;
}
