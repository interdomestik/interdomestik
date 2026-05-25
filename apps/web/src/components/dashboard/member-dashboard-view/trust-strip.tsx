import { CheckCircle2 } from 'lucide-react';

import type { DashboardTranslator } from './types';

type TrustStripProps = {
  locale: string;
  t: DashboardTranslator;
};

export function TrustStrip({ locale, t }: TrustStripProps) {
  const items = ['caseNumber', 'documents', 'transparent', 'privacy'];

  return (
    <section
      aria-labelledby="member-trust-strip-heading"
      className="rounded-lg border border-emerald-900/10 bg-emerald-950 p-5 text-white"
      data-testid="trust-strip"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 id="member-trust-strip-heading" className="text-lg font-semibold tracking-tight">
            {t('trust.title')}
          </h2>
          <p className="mt-1 text-sm leading-6 text-emerald-50">{t('trust.body')}</p>
        </div>
        <a
          href={`/${locale}/legal/privacy`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950"
        >
          {t('trust.center')}
        </a>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(item => (
          <li
            key={item}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm font-medium text-emerald-50"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-200" aria-hidden="true" />
            {t(`trust.items.${item}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
