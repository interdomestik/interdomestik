import { FileUp, LockKeyhole } from 'lucide-react';

import type { DashboardTranslator } from './types';

type DocumentVaultSummaryProps = {
  documentsCount: number;
  hasActiveCases: boolean;
  locale: string;
  t: DashboardTranslator;
};

export function DocumentVaultSummary({
  documentsCount,
  hasActiveCases,
  locale,
  t,
}: DocumentVaultSummaryProps) {
  return (
    <section
      aria-labelledby="member-document-vault-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-36px_rgba(18,52,43,0.55)]"
      data-testid="document-vault-summary"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            {t('documents.kicker')}
          </p>
          <h2
            id="member-document-vault-heading"
            className="mt-1 text-lg font-semibold tracking-tight text-slate-950"
          >
            {t('documents.title')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('documents.body')}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('documents.saved')}
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{documentsCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-stone-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('documents.missing')}
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-800">
            {hasActiveCases ? t('documents.missingActive') : t('documents.missingNoCase')}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-blue-900/10 bg-blue-50 p-4">
        <p className="text-sm leading-6 text-slate-700">{t('documents.consent')}</p>
      </div>

      <a
        href={`/${locale}/member/documents`}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-emerald-900/20 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2 sm:w-auto"
      >
        <FileUp className="h-4 w-4" aria-hidden="true" />
        {t('documents.cta')}
      </a>
    </section>
  );
}
