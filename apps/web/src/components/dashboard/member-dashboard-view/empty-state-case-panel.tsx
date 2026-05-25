import { FilePlus2 } from 'lucide-react';

import type { DashboardTranslator } from './types';

type EmptyStateCasePanelProps = {
  locale: string;
  t: DashboardTranslator;
};

export function EmptyStateCasePanel({ locale, t }: EmptyStateCasePanelProps) {
  return (
    <div
      className="rounded-lg border border-dashed border-emerald-900/25 bg-emerald-50/70 p-5"
      data-testid="empty-state-case-panel"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-800">
          <FilePlus2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-slate-950">{t('cases.emptyTitle')}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-700">{t('cases.emptyBody')}</p>
        </div>
      </div>
      <a
        href={`/${locale}/member/claims/new`}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-900/20 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2"
      >
        {t('cases.emptyCta')}
      </a>
    </div>
  );
}
