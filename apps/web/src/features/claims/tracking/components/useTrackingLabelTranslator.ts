'use client';

import { useTranslations } from 'next-intl';

export function useTrackingLabelTranslator(): (labelKey: string) => string {
  const tTrackingStatus = useTranslations('claims-tracking.status');
  const tTrackingTimeline = useTranslations('claims-tracking.tracking.timeline');

  return (labelKey: string) => {
    if (labelKey.startsWith('claims-tracking.status.')) {
      return tTrackingStatus(labelKey.replace('claims-tracking.status.', ''));
    }

    if (labelKey.startsWith('claims-tracking.tracking.timeline.')) {
      return tTrackingTimeline(labelKey.replace('claims-tracking.tracking.timeline.', ''));
    }

    return tTrackingTimeline('generic');
  };
}
