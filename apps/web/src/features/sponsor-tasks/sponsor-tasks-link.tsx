import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

export function SponsorTasksLink(): ReactElement {
  const t = useTranslations('sponsorTasks');
  return (
    <Link
      href="/staff/sponsors/tasks"
      className="underline focus-visible:outline focus-visible:outline-2"
    >
      {t('tasksLink')}
    </Link>
  );
}
