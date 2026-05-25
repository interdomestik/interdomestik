import { ArrowRight, ClipboardCheck } from 'lucide-react';

import type { DashboardTranslator } from './types';

export type NextStepModel = {
  body: string;
  href: string;
  label: string;
  testId: string;
  title: string;
};

type NextStepCardProps = {
  compact?: boolean;
  nextStep: NextStepModel;
  t: DashboardTranslator;
};

export function NextStepCard({ compact = false, nextStep, t }: NextStepCardProps) {
  return (
    <section
      aria-labelledby="member-next-step-heading"
      className={
        compact
          ? 'relative rounded-[1.25rem] border border-emerald-900/10 bg-white p-3 shadow-md shadow-emerald-900/5'
          : 'rounded-[1.55rem] border border-blue-900/10 bg-[#eef7fb] p-4 shadow-lg shadow-blue-900/5 sm:p-5'
      }
      data-testid="next-step-card"
    >
      <div className={compact ? 'flex items-center gap-3' : 'flex items-start gap-3'}>
        <span
          className={
            compact
              ? 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#e9f4ed] text-[#0e5c2b]'
              : 'mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-800 shadow-sm'
          }
        >
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p
            className={
              compact
                ? 'text-[0.55rem] font-extrabold uppercase tracking-widest text-[#0e5c2b]'
                : 'text-xs font-semibold uppercase tracking-wide text-blue-800'
            }
          >
            {t('nextStep.kicker')}
          </p>
          <h2
            id="member-next-step-heading"
            className={
              compact
                ? 'mt-0.5 truncate text-sm font-extrabold tracking-tight text-slate-950'
                : 'mt-1 text-xl font-semibold tracking-tight text-slate-950'
            }
          >
            {nextStep.title}
          </h2>
          <p
            className={
              compact
                ? 'mt-1 line-clamp-1 text-[0.64rem] font-medium leading-tight text-slate-600'
                : 'mt-2 text-sm leading-6 text-slate-700'
            }
          >
            {nextStep.body}
          </p>
        </div>
        {compact ? <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-[#0e5c2b]" /> : null}
      </div>
      {compact ? (
        <a
          data-testid={`${nextStep.testId}-mobile`}
          href={nextStep.href}
          className="absolute inset-0 rounded-[1.25rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e5c2b] focus-visible:ring-offset-2"
          aria-label={`${nextStep.title}: ${nextStep.label}`}
        />
      ) : (
        <a
          data-testid={nextStep.testId}
          href={nextStep.href}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-950 focus-visible:ring-offset-2 sm:w-auto"
        >
          {nextStep.label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
