import type { ReactNode } from 'react';

import type { CaseSummary } from '@interdomestik/domain-member';

import { DEFAULT_LOCALE } from '@/i18n/locales';
import { formatNumber } from '@/lib/utils/number';

export type CaseSummaryLabels = {
  reference: string;
  referenceFallback: string;
  status: string;
  statusValue: string;
  documentCount: string;
  nextStep: string;
  nextStepValue: string;
};

export type CaseSummaryCardProps = Readonly<{
  entry: ReactNode;
  labels: CaseSummaryLabels;
  referenceValue: string;
  summary: CaseSummary;
}>;

export function CaseSummaryCard({ entry, labels, referenceValue, summary }: CaseSummaryCardProps) {
  const headingId = `case-summary-${summary.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="min-w-0 space-y-5 rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-5 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]"
    >
      <div className="space-y-1">
        <p className="text-sm text-foreground/70">{labels.reference}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h3 id={headingId} className="min-w-0 text-lg font-semibold">
            {referenceValue}
          </h3>
          <dl className="min-w-0 max-w-full">
            <dt className="sr-only">{labels.status}</dt>
            <dd className="rounded-full border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-strong))] px-2.5 py-1 text-xs font-semibold forced-colors:border-[CanvasText]">
              {labels.statusValue}
            </dd>
          </dl>
        </div>
      </div>
      <dl className="grid min-w-0 gap-4 border-t border-[hsl(var(--border-strong))] pt-5 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] forced-colors:border-[CanvasText]">
        <div className="min-w-0 space-y-1">
          <dt className="text-foreground/70">{labels.nextStep}</dt>
          <dd className="font-medium">{labels.nextStepValue}</dd>
        </div>
        <div className="min-w-0 space-y-1">
          <dt className="text-foreground/70">{labels.documentCount}</dt>
          <dd className="font-medium">{formatNumber(summary.documentCount, DEFAULT_LOCALE)}</dd>
        </div>
      </dl>
      {entry}
    </article>
  );
}
