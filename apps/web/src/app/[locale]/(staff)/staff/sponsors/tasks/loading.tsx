import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

export default async function LoadingSponsorTasks(): Promise<ReactElement> {
  const t = await getTranslations('sponsorTasks');
  return (
    <p role="status" aria-live="polite">
      {t('loading')}
    </p>
  );
}
