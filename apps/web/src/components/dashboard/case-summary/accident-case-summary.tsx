import type { ReactNode } from 'react';

import type { CaseSummary } from '@interdomestik/domain-member';

export type CaseSummaryLabels = {
  reference: string;
  referenceFallback: string;
  status: string;
  statusValue: string;
  documentCount: string;
  documentCountValue?: string;
  nextStep: string;
  nextStepValue: string;
};

export type CaseSummaryCardProps = Readonly<{
  entry: ReactNode;
  labels: CaseSummaryLabels;
  referenceValue: string;
  summary: CaseSummary;
}>;

const STATUS_TINT = {
  draft: 'bg-[hsl(var(--surface-strong))]',
  submitted: 'bg-[hsl(var(--primary-soft))]',
  submitted_to_airline: 'bg-[hsl(var(--primary-soft))]',
  verification: 'bg-[hsl(var(--primary-soft))]',
  evaluation: 'bg-[hsl(var(--primary-soft))]',
  negotiation: 'bg-[hsl(var(--primary-soft))]',
  court: 'bg-amber-100 dark:bg-amber-950',
  resolved: 'bg-green-100 dark:bg-green-950',
  rejected: 'bg-red-100 dark:bg-red-950',
} satisfies Record<CaseSummary['status'], string>;

export function caseSummaryStatusPillClass(status: CaseSummary['status']) {
  return `inline-block max-w-full rounded-full border border-foreground/60 px-2.5 py-1 text-xs font-semibold forced-colors:border-[CanvasText] ${STATUS_TINT[status]}`;
}

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
            <dd className={caseSummaryStatusPillClass(summary.status)}>{labels.statusValue}</dd>
          </dl>
        </div>
      </div>
      <dl className="grid min-w-0 gap-4 border-t border-[hsl(var(--border-strong))] pt-5 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] forced-colors:border-[CanvasText]">
        <div
          className={`min-w-0 space-y-1 ${
            summary.nextStep === 'member_action'
              ? 'rounded-lg border-s-4 border-primary bg-[hsl(var(--primary-soft))] p-3 forced-colors:border-[CanvasText]'
              : ''
          }`}
        >
          <dt className="text-foreground/70">{labels.nextStep}</dt>
          <dd className="font-medium">{labels.nextStepValue}</dd>
        </div>
        <div className="min-w-0 space-y-1">
          <dt className="text-foreground/70">{labels.documentCount}</dt>
          <dd className="font-medium">
            {labels.documentCountValue ?? String(summary.documentCount)}
          </dd>
        </div>
      </dl>
      {entry}
    </article>
  );
}
