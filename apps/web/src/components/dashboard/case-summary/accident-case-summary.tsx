import type { ReactNode } from 'react';

import type { CaseSummary } from '@interdomestik/domain-member';

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
      className="min-w-0 overflow-hidden rounded-2xl border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] shadow-sm forced-colors:border-[CanvasText]"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/65">
            {labels.reference}
          </p>
          <h3 id={headingId} className="text-lg font-semibold [overflow-wrap:anywhere]">
            {referenceValue}
          </h3>
        </div>
        <dl className="min-w-0 max-w-full shrink-0">
          <div>
            <dt className="sr-only">{labels.status}</dt>
            <dd className="max-w-full rounded-full border border-[hsl(var(--border-strong))] px-3 py-1.5 text-xs font-semibold [overflow-wrap:anywhere] forced-colors:border-[CanvasText]">
              {labels.statusValue}
            </dd>
          </div>
        </dl>
      </div>
      <dl className="min-w-0 border-y border-[hsl(var(--border))] bg-[hsl(var(--primary-soft))]/50 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/65">
            {labels.nextStep}
          </dt>
          <dd className="mt-1 text-lg font-semibold text-[hsl(var(--primary))] dark:text-foreground [overflow-wrap:anywhere] sm:text-xl">
            {labels.nextStepValue}
          </dd>
        </div>
      </dl>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <dl className="min-w-0">
          <div>
            <dt className="text-xs text-foreground/65">{labels.documentCount}</dt>
            <dd className="text-lg font-semibold">{summary.documentCount}</dd>
          </div>
        </dl>
        {entry}
      </div>
    </article>
  );
}
