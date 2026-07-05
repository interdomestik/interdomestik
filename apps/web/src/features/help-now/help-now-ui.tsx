import type { ReactNode } from 'react';

type HelpNowPanelProps = Readonly<
  { children: ReactNode } & (
    { title: string; titleId: string } | { title?: undefined; titleId?: string }
  )
>;

type HelpNowMetricProps = Readonly<{
  label: string;
  value: ReactNode;
}>;

export function HelpNowPanel({ children, title, titleId }: HelpNowPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby={titleId}>
      {title ? (
        <h2 id={titleId} className="text-lg font-semibold text-slate-950">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function HelpNowMetric({ label, value }: HelpNowMetricProps) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
