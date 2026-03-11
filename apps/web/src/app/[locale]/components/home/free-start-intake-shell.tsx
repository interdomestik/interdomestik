'use client';

import { Link } from '@/i18n/routing';
import { CommercialFunnelEvents, resolveFunnelVariant } from '@/lib/analytics';
import { getSupportContacts } from '@/lib/support-contacts';
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  Home,
  PhoneCall,
  Stethoscope,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type FreeStartIntakeShellProps = Readonly<{
  continueHref: string;
  locale: string;
  tenantId?: string | null;
}>;

type CategoryId = 'vehicle' | 'property' | 'injury';
type OutcomeId = 'repair' | 'reimbursement' | 'compensation' | 'written_response';
type VehicleIssueId = 'collision' | 'theft' | 'parking_damage' | 'insurer_delay';
type PropertyIssueId = 'water_damage' | 'storm_fire' | 'burglary' | 'landlord_dispute';
type InjuryIssueId =
  | 'workplace_injury'
  | 'traffic_injury'
  | 'medical_negligence'
  | 'public_liability';
type IssueId = VehicleIssueId | PropertyIssueId | InjuryIssueId;
type StepId = 'category' | 'details' | 'preview' | 'complete';

type DraftState = {
  issueType: string;
  incidentDate: string;
  counterparty: string;
  desiredOutcome: string;
  summary: string;
};

const CATEGORY_CONFIG: ReadonlyArray<{
  icon: typeof Car;
  id: CategoryId;
  issueIds: ReadonlyArray<IssueId>;
}> = [
  {
    icon: Car,
    id: 'vehicle',
    issueIds: ['collision', 'theft', 'parking_damage', 'insurer_delay'],
  },
  {
    icon: Home,
    id: 'property',
    issueIds: ['water_damage', 'storm_fire', 'burglary', 'landlord_dispute'],
  },
  {
    icon: Stethoscope,
    id: 'injury',
    issueIds: ['workplace_injury', 'traffic_injury', 'medical_negligence', 'public_liability'],
  },
];

const OUTCOME_IDS: ReadonlyArray<OutcomeId> = [
  'repair',
  'reimbursement',
  'compensation',
  'written_response',
];

const EMPTY_DRAFT: DraftState = {
  issueType: '',
  incidentDate: '',
  counterparty: '',
  desiredOutcome: '',
  summary: '',
};

function getIssueIds(category: CategoryId | null): ReadonlyArray<IssueId> {
  return CATEGORY_CONFIG.find(item => item.id === category)?.issueIds ?? [];
}

export function FreeStartIntakeShell({
  continueHref,
  locale,
  tenantId,
}: FreeStartIntakeShellProps) {
  const t = useTranslations('freeStart');
  const contacts = getSupportContacts({ locale, tenantId });
  const [step, setStep] = useState<StepId>('category');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [validationError, setValidationError] = useState<string | null>(null);

  const issueIds = getIssueIds(selectedCategory);
  const isMemberContinue = continueHref.startsWith('/member');
  const continueLabel = isMemberContinue
    ? t('completion.continueMember')
    : t('completion.continueMembership');

  const activeStepIndex =
    step === 'category' ? 0 : step === 'details' ? 1 : step === 'preview' ? 2 : 2;

  const progressSteps = ['choose', 'details', 'preview'] as const;

  const selectedIssueLabel =
    selectedCategory && draft.issueType
      ? t(`issues.${selectedCategory}.${draft.issueType}`)
      : t('preview.notProvided');

  const selectedOutcomeLabel = draft.desiredOutcome
    ? t(`outcomes.${draft.desiredOutcome}`)
    : t('preview.notProvided');

  const handleCategorySelect = (category: CategoryId) => {
    setSelectedCategory(category);
    setDraft(current => ({ ...current, issueType: '' }));
    setValidationError(null);
  };

  const moveToDetails = () => {
    if (selectedCategory === null) {
      setValidationError(t('validation.chooseCategory'));
      return;
    }

    setValidationError(null);
    setStep('details');
  };

  const moveToPreview = () => {
    if (
      selectedCategory === null ||
      draft.issueType.trim().length === 0 ||
      draft.incidentDate.trim().length === 0 ||
      draft.counterparty.trim().length === 0 ||
      draft.desiredOutcome.trim().length === 0 ||
      draft.summary.trim().length === 0
    ) {
      setValidationError(t('validation.completeIntake'));
      return;
    }

    setValidationError(null);
    setStep('preview');
  };

  const finishIntake = () => {
    if (selectedCategory === null) {
      setValidationError(t('validation.chooseCategory'));
      setStep('category');
      return;
    }

    CommercialFunnelEvents.freeStartCompleted(
      {
        tenantId,
        variant: resolveFunnelVariant(true),
        locale,
      },
      {
        claim_category: selectedCategory,
        intake_issue: draft.issueType,
        desired_outcome: draft.desiredOutcome,
      }
    );
    setValidationError(null);
    setStep('complete');
  };

  return (
    <section
      id="free-start-intake"
      data-testid="free-start-intake-shell"
      className="border-b border-slate-200/80 bg-slate-950 text-slate-50"
    >
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 md:py-16">
        <div className="space-y-4">
          <div className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
            {t('eyebrow')}
          </div>
          <div className="max-w-3xl space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {t('title')}
            </h2>
            <p className="text-base leading-7 text-slate-300 md:text-lg">{t('subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {progressSteps.map((progressStep, index) => {
              const isActive = index === activeStepIndex;
              const isComplete = index < activeStepIndex || step === 'complete';

              return (
                <span
                  key={progressStep}
                  className={[
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
                    isActive
                      ? 'border-cyan-300/70 bg-cyan-300/15 text-cyan-100'
                      : isComplete
                        ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'
                        : 'border-slate-700 bg-slate-900/80 text-slate-400',
                  ].join(' ')}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
                    {index + 1}
                  </span>
                  {t(`steps.${progressStep}`)}
                </span>
              );
            })}
          </div>
          {validationError ? (
            <p
              data-testid="free-start-validation-error"
              className="rounded-2xl border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-100"
            >
              {validationError}
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-[0_30px_80px_-52px_rgba(15,23,42,0.95)]">
            {step === 'category' ? (
              <>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold text-white">{t('choose.heading')}</h3>
                  <p className="text-sm leading-6 text-slate-300">{t('choose.body')}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {CATEGORY_CONFIG.map(category => {
                    const Icon = category.icon;
                    const isSelected = selectedCategory === category.id;

                    return (
                      <button
                        key={category.id}
                        data-testid={`free-start-category-${category.id}`}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleCategorySelect(category.id)}
                        className={[
                          'flex h-full flex-col gap-4 rounded-2xl border p-4 text-left transition',
                          isSelected
                            ? 'border-cyan-300 bg-cyan-300/10 text-white'
                            : 'border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500 hover:bg-slate-900',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'inline-flex h-11 w-11 items-center justify-center rounded-2xl',
                            isSelected
                              ? 'bg-cyan-200 text-slate-950'
                              : 'bg-slate-800 text-cyan-100',
                          ].join(' ')}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="space-y-2">
                          <p className="text-lg font-semibold">
                            {t(`categories.${category.id}.title`)}
                          </p>
                          <p className="text-sm leading-6 text-slate-300">
                            {t(`categories.${category.id}.description`)}
                          </p>
                          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                            {t(`categories.${category.id}.examples`)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={moveToDetails}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                  >
                    {t('choose.continue')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : null}

            {step === 'details' ? (
              <>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold text-white">{t('details.heading')}</h3>
                  <p className="text-sm leading-6 text-slate-300">{t('details.body')}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    <span>{t('details.issueType')}</span>
                    <select
                      aria-label={t('details.issueType')}
                      value={draft.issueType}
                      onChange={event =>
                        setDraft(current => ({ ...current, issueType: event.target.value }))
                      }
                      className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300"
                    >
                      <option value="">{t('details.selectPlaceholder')}</option>
                      {issueIds.map(issueId => (
                        <option key={issueId} value={issueId}>
                          {t(`issues.${selectedCategory}.${issueId}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    <span>{t('details.incidentDate')}</span>
                    <input
                      aria-label={t('details.incidentDate')}
                      type="date"
                      value={draft.incidentDate}
                      onChange={event =>
                        setDraft(current => ({ ...current, incidentDate: event.target.value }))
                      }
                      className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    <span>{t('details.counterparty')}</span>
                    <input
                      aria-label={t('details.counterparty')}
                      type="text"
                      value={draft.counterparty}
                      onChange={event =>
                        setDraft(current => ({ ...current, counterparty: event.target.value }))
                      }
                      placeholder={t('details.counterpartyPlaceholder')}
                      className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-100">
                    <span>{t('details.desiredOutcome')}</span>
                    <select
                      aria-label={t('details.desiredOutcome')}
                      value={draft.desiredOutcome}
                      onChange={event =>
                        setDraft(current => ({ ...current, desiredOutcome: event.target.value }))
                      }
                      className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300"
                    >
                      <option value="">{t('details.selectPlaceholder')}</option>
                      {OUTCOME_IDS.map(outcomeId => (
                        <option key={outcomeId} value={outcomeId}>
                          {t(`outcomes.${outcomeId}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="space-y-2 text-sm font-medium text-slate-100">
                  <span>{t('details.summary')}</span>
                  <textarea
                    aria-label={t('details.summary')}
                    value={draft.summary}
                    onChange={event =>
                      setDraft(current => ({ ...current, summary: event.target.value }))
                    }
                    placeholder={t('details.summaryPlaceholder')}
                    rows={5}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
                  />
                </label>
                <div className="flex flex-wrap justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setValidationError(null);
                      setStep('category');
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-950"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t('details.back')}
                  </button>
                  <button
                    type="button"
                    onClick={moveToPreview}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                  >
                    {t('details.continue')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : null}

            {step === 'preview' || step === 'complete' ? (
              <>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold text-white">{t('preview.heading')}</h3>
                  <p className="text-sm leading-6 text-slate-300">{t('preview.body')}</p>
                </div>
                <div className="rounded-3xl border border-cyan-300/30 bg-cyan-300/8 p-5">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-slate-950/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                      {t('preview.packBadge')}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {t('preview.categoryLabel')}
                        </p>
                        <p className="text-base font-semibold text-white">
                          {selectedCategory
                            ? t(`categories.${selectedCategory}.title`)
                            : t('preview.notProvided')}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {t('preview.issueLabel')}
                        </p>
                        <p className="text-base font-semibold text-white">{selectedIssueLabel}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {t('preview.dateLabel')}
                        </p>
                        <p className="text-base font-semibold text-white">
                          {draft.incidentDate || t('preview.notProvided')}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {t('preview.counterpartyLabel')}
                        </p>
                        <p className="text-base font-semibold text-white">
                          {draft.counterparty || t('preview.notProvided')}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {t('preview.outcomeLabel')}
                      </p>
                      <p className="text-base font-semibold text-white">{selectedOutcomeLabel}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {t('preview.summaryLabel')}
                      </p>
                      <p className="text-sm leading-6 text-slate-200">
                        {draft.summary || t('preview.notProvided')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {t('preview.includesHeading')}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {(['summary', 'timeline', 'handoff'] as const).map(item => (
                      <li
                        key={item}
                        className="flex items-start gap-3 text-sm leading-6 text-slate-200"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <span>{t(`preview.includes.${item}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {step === 'preview' ? (
                  <div className="flex flex-wrap justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setValidationError(null);
                        setStep('details');
                      }}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-950"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      {t('preview.back')}
                    </button>
                    <button
                      type="button"
                      onClick={finishIntake}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                    >
                      {t('preview.finish')}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <aside className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            {step === 'complete' ? (
              <div data-testid="free-start-complete" className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('completion.badge')}
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-semibold text-white">{t('completion.heading')}</h3>
                  <p className="text-sm leading-6 text-slate-300">{t('completion.body')}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={continueHref}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    {continueLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {contacts.telHref ? (
                    <a
                      href={contacts.telHref}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-950"
                    >
                      <PhoneCall className="h-4 w-4" />
                      {t('completion.hotline')}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
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
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm leading-6 text-slate-200"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      <span>{t(`support.points.${item}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
