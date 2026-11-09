'use client';

import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

/** Reads the sponsor layout's client catalog, which carries the route locale. */
export function SponsorTasksLoading(): ReactElement {
  const t = useTranslations('sponsorTasks');
  return (
    <p role="status" aria-live="polite">
      {t('loading')}
    </p>
  );
}
