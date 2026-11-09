import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

export type SponsorTasksArea = 'staff' | 'admin';

export function SponsorTasksLink({ area }: Readonly<{ area: SponsorTasksArea }>): ReactElement {
  const t = useTranslations('sponsorTasks');
  return (
    <Link
      href={`/${area}/sponsors/tasks`}
      className="underline focus-visible:outline focus-visible:outline-2"
    >
      {t('tasksLink')}
    </Link>
  );
}
