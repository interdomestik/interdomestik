import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactElement } from 'react';
import type { SponsorTasksArea } from './sponsor-tasks-link';
import { SponsorTaskList } from './task-list';
import { loadSponsorTasks } from './tasks.core';

/** The handover task queue, shared by the canonical staff and admin routes (§3.4). */
export async function SponsorTasksPage({
  area,
  params,
}: {
  area: SponsorTasksArea;
  params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('sponsorTasks');
  const result = await loadSponsorTasks();
  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid={`${area}-sponsor-tasks-page-ready`}>
      <h1
        id="sponsor-tasks-title"
        tabIndex={-1}
        className="text-2xl font-bold focus-visible:outline focus-visible:outline-2"
      >
        {t('title')}
      </h1>
      {result.ok ? (
        <SponsorTaskList tasks={result.tasks} />
      ) : (
        <div role="alert" className="space-y-3">
          <p>{t(`errors.${result.error}`)}</p>
          {result.error !== 'forbidden' && (
            <a href={`/${locale}/${area}/sponsors/tasks`} className="underline">
              {t('retry')}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
