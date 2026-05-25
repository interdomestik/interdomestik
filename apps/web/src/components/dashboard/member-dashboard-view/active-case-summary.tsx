import { ArrowRight, Clock3 } from 'lucide-react';

import { resolveDateLocale } from '@/lib/utils/date';

import { EmptyStateCasePanel } from './empty-state-case-panel';
import type { DashboardClaim, DashboardTranslator } from './types';

type ActiveCaseSummaryProps = {
  activeCases: DashboardClaim[];
  locale: string;
  t: DashboardTranslator;
};

export function ActiveCaseSummary({ activeCases, locale, t }: ActiveCaseSummaryProps) {
  const priorityCase = activeCases[0] ?? null;

  return (
    <section
      aria-labelledby="member-active-cases-heading"
      className="rounded-[1.5rem] border border-emerald-950/10 bg-white p-5 shadow-[0_18px_45px_-36px_rgba(18,52,43,0.55)]"
      data-testid="active-case-summary"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            {t('cases.kicker')}
          </p>
          <h2
            id="member-active-cases-heading"
            className="mt-1 text-xl font-semibold tracking-tight text-slate-950"
          >
            {t('cases.title')}
          </h2>
        </div>
        <a
          href={`/${locale}/member/claims`}
          className="hidden min-h-11 items-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2 sm:inline-flex"
        >
          {t('cases.viewAll')}
        </a>
      </div>

      {priorityCase ? (
        <article
          className="mt-4 rounded-[1.25rem] border border-emerald-950/10 bg-[#f8f5ee] p-4"
          data-testid="active-case-card"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-950">{t('cases.caseFallback')}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {t('cases.caseNumber')}: {priorityCase.claimNumber ?? priorityCase.id}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {t('cases.status')}: {priorityCase.stageLabel}
              </p>
            </div>
            <a
              href={`/${locale}/member/claims/${priorityCase.id}`}
              data-testid="member-active-claim"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-emerald-900 ring-1 ring-slate-200 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2"
            >
              {t('cases.open')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div className="mt-4 border-l-2 border-emerald-900/20 pl-3">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Clock3 className="h-4 w-4 text-emerald-800" aria-hidden="true" />
              {t('cases.lastUpdate')}: {formatDate(priorityCase.updatedAt, locale, t)}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {priorityCase.requiresMemberAction && priorityCase.nextMemberAction
                ? priorityCase.nextMemberAction.label
                : t('cases.timelinePreview')}
            </p>
          </div>
          <a
            href={`/${locale}/member/help?claimId=${encodeURIComponent(priorityCase.id)}`}
            data-testid="member-support-link"
            className="mt-4 inline-flex min-h-11 items-center rounded-2xl border border-emerald-900/10 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2"
          >
            {t('cases.support')}
          </a>
        </article>
      ) : (
        <div className="mt-4">
          <EmptyStateCasePanel locale={locale} t={t} />
        </div>
      )}
      <a
        href={`/${locale}/member/claims`}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2 sm:hidden"
      >
        {t('cases.viewAll')}
      </a>
    </section>
  );
}

function formatDate(value: string | null, locale: string, t: DashboardTranslator) {
  if (!value) return t('common.unavailable');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('common.unavailable');

  return new Intl.DateTimeFormat(resolveDateLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
