import type { AccidentSummary } from '@interdomestik/domain-member';

export type AccidentCaseSummaryProps = {
  summary: AccidentSummary;
  labels: {
    reference: string;
    referenceFallback: string;
    status: string;
    statusValue: string;
    documentCount: string;
    nextStep: string;
    nextStepValue: string;
  };
};

export function AccidentCaseSummary({ labels, summary }: AccidentCaseSummaryProps) {
  const headingId = `case-summary-${summary.id}`;
  const reference = summary.reference ?? labels.referenceFallback;

  return (
    <article aria-labelledby={headingId}>
      <p>{labels.reference}</p>
      <h3 id={headingId}>{reference}</h3>
      <dl>
        <div>
          <dt>{labels.status}</dt>
          <dd>{labels.statusValue}</dd>
        </div>
        <div>
          <dt>{labels.documentCount}</dt>
          <dd>{summary.documentCount}</dd>
        </div>
        <div>
          <dt>{labels.nextStep}</dt>
          <dd>{labels.nextStepValue}</dd>
        </div>
      </dl>
    </article>
  );
}
