import { Link } from '@/i18n/routing';
import { ArrowRight, CheckCircle2, PhoneCall } from 'lucide-react';

import { EVIDENCE_ITEM_IDS } from './constants';
import { getConfidenceClassName, getRecommendedContinueLabel } from './helpers';
import type { CategoryId, ConfidenceLevel, FreeStartCopy, StepId, SupportContacts } from './types';

type FreeStartSidebarProps = Readonly<{
  confidenceLevel: ConfidenceLevel;
  contacts: SupportContacts;
  continueHref: string;
  continueLabel: string;
  selectedCategory: CategoryId | null;
  step: StepId;
  t: FreeStartCopy;
}>;

type FreeStartTrustPanelProps = Readonly<{
  selectedCategory: CategoryId | null;
  t: FreeStartCopy;
}>;

function FreeStartTrustPanel({ selectedCategory, t }: FreeStartTrustPanelProps) {
  const evidencePrefix = selectedCategory ? `trust.evidence.${selectedCategory}` : null;

  return (
    <div className="space-y-4">
      <div
        data-testid="free-start-evidence-guidance"
        className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5"
      >
        <div className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
          {t('trust.evidence.badge')}
        </div>
        <div className="mt-3 space-y-2">
          <h4 className="text-base font-semibold text-white">
            {selectedCategory
              ? t(`${evidencePrefix}.heading`)
              : t('trust.evidence.placeholder.heading')}
          </h4>
          <p className="text-sm leading-6 text-slate-300">
            {selectedCategory ? t(`${evidencePrefix}.body`) : t('trust.evidence.placeholder.body')}
          </p>
        </div>
        {selectedCategory ? (
          <ul className="mt-4 space-y-2">
            {EVIDENCE_ITEM_IDS.map(item => (
              <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{t(`${evidencePrefix}.items.${item}`)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div
        data-testid="free-start-privacy-note"
        className="rounded-3xl border border-emerald-300/20 bg-emerald-300/8 p-5"
      >
        <div className="inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
          {t('trust.privacy.badge')}
        </div>
        <div className="mt-3 space-y-2">
          <h4 className="text-base font-semibold text-white">{t('trust.privacy.heading')}</h4>
          <p className="text-sm leading-6 text-slate-200">{t('trust.privacy.body')}</p>
        </div>
      </div>

      <div
        data-testid="free-start-triage-note"
        className="rounded-3xl border border-amber-300/20 bg-amber-300/8 p-5"
      >
        <div className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
          {t('trust.triage.badge')}
        </div>
        <div className="mt-3 space-y-2">
          <h4 className="text-base font-semibold text-white">{t('trust.triage.heading')}</h4>
          <p className="text-sm leading-6 text-slate-200">{t('trust.triage.body')}</p>
        </div>
      </div>
    </div>
  );
}

export function FreeStartSidebar({
  confidenceLevel,
  contacts,
  continueHref,
  continueLabel,
  selectedCategory,
  step,
  t,
}: FreeStartSidebarProps) {
  if (step === 'complete') {
    const showHotlinePrimary = confidenceLevel === 'low';
    let primaryContinueLabel = continueLabel;

    if (confidenceLevel === 'high' || confidenceLevel === 'medium') {
      primaryContinueLabel = getRecommendedContinueLabel(t, continueHref, confidenceLevel);
    }

    const renderPrimaryAction = () => {
      if (showHotlinePrimary) {
        return (
          <a
            href={contacts.telHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            <PhoneCall className="h-4 w-4" />
            {t('completion.cta.hotline.low')}
          </a>
        );
      }

      return (
        <Link
          href={continueHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
        >
          {primaryContinueLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      );
    };

    const renderSecondaryAction = () => {
      if (showHotlinePrimary) {
        return (
          <Link
            href={continueHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-950"
          >
            {continueLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        );
      }

      return (
        <a
          href={contacts.telHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-950"
        >
          <PhoneCall className="h-4 w-4" />
          {t('completion.cta.hotline.secondary')}
        </a>
      );
    };

    return (
      <div className="space-y-4">
        <div data-testid="free-start-complete" className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('completion.badge')}
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold text-white">{t('completion.heading')}</h3>
            <p className="text-sm leading-6 text-slate-300">{t('completion.body')}</p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {t('completion.confidence.eyebrow')}
            </p>
            <div className="mt-3 space-y-3">
              <span
                data-testid="free-start-confidence-level"
                className={getConfidenceClassName(confidenceLevel)}
              >
                {t(`completion.confidence.levels.${confidenceLevel}.label`)}
              </span>
              <p className="text-sm leading-6 text-slate-200">
                {t(`completion.confidence.levels.${confidenceLevel}.body`)}
              </p>
            </div>
          </div>
          <div
            data-testid="free-start-next-step"
            className="rounded-3xl border border-cyan-300/20 bg-cyan-300/8 p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              {t('completion.nextStep.heading')}
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-100">
              {t(`completion.nextStep.levels.${confidenceLevel}`)}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {renderPrimaryAction()}
            {renderSecondaryAction()}
          </div>
        </div>
        <FreeStartTrustPanel selectedCategory={selectedCategory} t={t} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
          {t('support.badge')}
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white">{t('support.heading')}</h3>
          <p className="text-sm leading-6 text-slate-300">{t('support.body')}</p>
        </div>
        <ul className="space-y-2">
          {(['lane', 'facts', 'handoff'] as const).map(item => (
            <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <span>{t(`support.points.${item}`)}</span>
            </li>
          ))}
        </ul>
      </div>
      <FreeStartTrustPanel selectedCategory={selectedCategory} t={t} />
    </div>
  );
}
