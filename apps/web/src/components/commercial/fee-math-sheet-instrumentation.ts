import { trackEvent } from '@/lib/analytics';

import type { ThirdPartyCostTreatment } from './fee-math-sheet-copy';

export type FeeSheetViewedProperties = Readonly<{
  context: 'membership' | 'recovery_agreement' | 'vonesa' | 'expert_cost';
  locale: string;
  source_surface: string;
  third_party_cost_mode: ThirdPartyCostTreatment['mode'];
  offline_available: boolean;
}>;

const ALLOWED_FEE_SHEET_VIEWED_KEYS = new Set<keyof FeeSheetViewedProperties>([
  'context',
  'locale',
  'source_surface',
  'third_party_cost_mode',
  'offline_available',
]);

export function trackFeeSheetViewed(properties: FeeSheetViewedProperties) {
  const safeProperties = Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      return (
        ALLOWED_FEE_SHEET_VIEWED_KEYS.has(key as keyof FeeSheetViewedProperties) &&
        value !== undefined
      );
    })
  );

  trackEvent('fee_sheet_viewed', safeProperties);
}
