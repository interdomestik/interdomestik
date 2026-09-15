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
      className="grid min-w-0 gap-4 rounded-2xl border border-border bg-background/80 p-4 sm:p-5"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground/65">
          {labels.reference}
        </p>
        <h3 id={headingId} className="text-lg font-semibold [overflow-wrap:anywhere]">
          {referenceValue}
        </h3>
      </div>
      <dl className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <dt>{labels.status}</dt>
          <dd className="break-words font-medium">{labels.statusValue}</dd>
        </div>
        <div className="min-w-0">
          <dt>{labels.documentCount}</dt>
          <dd className="font-medium">{summary.documentCount}</dd>
        </div>
        <div className="min-w-0">
          <dt>{labels.nextStep}</dt>
          <dd className="break-words font-medium">{labels.nextStepValue}</dd>
        </div>
      </dl>
      {entry}
    </article>
  );
}
