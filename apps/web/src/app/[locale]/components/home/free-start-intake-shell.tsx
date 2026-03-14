'use client';

import { submitFreeStartIntake } from '@/actions/free-start.core';
import { Link } from '@/i18n/routing';
import { CommercialFunnelEvents, resolveFunnelVariant } from '@/lib/analytics';
import {
  FREE_START_ISSUES_BY_CATEGORY,
  FREE_START_OUTCOME_IDS,
  type FreeStartCategoryId as CategoryId,
  type FreeStartIssueId as IssueId,
  type FreeStartOutcomeId as OutcomeId,
} from '@/lib/free-start-contract';
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
import { useRef, useState } from 'react';

type FreeStartIntakeShellProps = Readonly<{
  continueHref: string;
  locale: string;
  tenantId?: string | null;
}>;

type StepId = 'category' | 'details' | 'preview' | 'complete';
type ConfidenceLevel = 'high' | 'medium' | 'low';
type ContinueRouteKey = 'membership' | 'member' | 'portal';
type EvidenceItemId = 'first' | 'second' | 'third';

type DraftState = {
  issueType: IssueId | '';
  incidentDate: string;
  counterparty: string;
  desiredOutcome: OutcomeId | '';
  summary: string;
};

type DraftField = keyof DraftState;
type FreeStartCopy = (key: string) => string;
type SupportContacts = ReturnType<typeof getSupportContacts>;
type SetDraftField = <K extends DraftField>(field: K, value: DraftState[K]) => void;

const CATEGORY_CONFIG: ReadonlyArray<{
  icon: typeof Car;
  id: CategoryId;
  issueIds: ReadonlyArray<IssueId>;
}> = [
  {
    icon: Car,
    id: 'vehicle',
    issueIds: FREE_START_ISSUES_BY_CATEGORY.vehicle,
  },
  {
    icon: Home,
    id: 'property',
    issueIds: FREE_START_ISSUES_BY_CATEGORY.property,
  },
  {
    icon: Stethoscope,
    id: 'injury',
    issueIds: FREE_START_ISSUES_BY_CATEGORY.injury,
  },
];

const OUTCOME_IDS: ReadonlyArray<OutcomeId> = FREE_START_OUTCOME_IDS;
const EVIDENCE_ITEM_IDS: ReadonlyArray<EvidenceItemId> = ['first', 'second', 'third'];

const COUNTERPARTY_DETAIL_MIN_LENGTH = 10;
const SUMMARY_DETAIL_MIN_LENGTH = 40;
const BASE_CONFIDENCE_SCORE = 1;
const HIGH_CONFIDENCE_MIN_SCORE = 5;
const MEDIUM_CONFIDENCE_MIN_SCORE = 3;

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

function getActiveStepIndex(step: StepId): number {
  if (step === 'category') {
    return 0;
  }

  if (step === 'details') {
    return 1;
  }

  return 2;
}

function getProgressStepClassName(isActive: boolean, isComplete: boolean): string {
  const baseClassName =
    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold';

  if (isActive) {
    return `${baseClassName} border-cyan-300/70 bg-cyan-300/15 text-cyan-100`;
  }

  if (isComplete) {
    return `${baseClassName} border-emerald-300/40 bg-emerald-300/10 text-emerald-100`;
  }

  return `${baseClassName} border-slate-700 bg-slate-900/80 text-slate-400`;
}

function getCategoryCardClassName(isSelected: boolean): string {
  const baseClassName = 'flex h-full flex-col gap-4 rounded-2xl border p-4 text-left transition';

  if (isSelected) {
    return `${baseClassName} border-cyan-300 bg-cyan-300/10 text-white`;
  }

  return `${baseClassName} border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500 hover:bg-slate-900`;
}

function getCategoryIconClassName(isSelected: boolean): string {
  const baseClassName = 'inline-flex h-11 w-11 items-center justify-center rounded-2xl';

  if (isSelected) {
    return `${baseClassName} bg-cyan-200 text-slate-950`;
  }

  return `${baseClassName} bg-slate-800 text-cyan-100`;
}

function getSelectedIssueLabel(
  t: FreeStartCopy,
  selectedCategory: CategoryId | null,
  issueType: DraftState['issueType']
): string {
  if (selectedCategory && issueType) {
    return t(`issues.${selectedCategory}.${issueType}`);
  }

  return t('preview.notProvided');
}

function getSelectedOutcomeLabel(
  t: FreeStartCopy,
  desiredOutcome: DraftState['desiredOutcome']
): string {
  if (desiredOutcome) {
    return t(`outcomes.${desiredOutcome}`);
  }

  return t('preview.notProvided');
}

function getContinueLabel(t: FreeStartCopy, continueHref: string): string {
  const routeKey = getContinueRouteKey(continueHref);

  if (routeKey === 'membership') {
    return t('completion.continueMembership');
  }

  if (routeKey === 'member') {
    return t('completion.continueMember');
  }

  return t('completion.continuePortal');
}

function getContinueRouteKey(continueHref: string): ContinueRouteKey {
  if (continueHref === '/register') {
    return 'membership';
  }

  if (continueHref.startsWith('/member')) {
    return 'member';
  }

  return 'portal';
}

function getRecommendedContinueLabel(
  t: FreeStartCopy,
  continueHref: string,
  level: Extract<ConfidenceLevel, 'high' | 'medium'>
): string {
  return t(`completion.cta.${getContinueRouteKey(continueHref)}.${level}`);
}

function getConfidenceLevel(
  selectedCategory: CategoryId | null,
  draft: DraftState
): ConfidenceLevel {
  if (selectedCategory === null) {
    return 'low';
  }

  const hasMonetaryOutcome =
    draft.desiredOutcome !== '' && draft.desiredOutcome !== 'written_response';
  const hasDetailedCounterparty =
    draft.counterparty.trim().length >= COUNTERPARTY_DETAIL_MIN_LENGTH;
  const hasDetailedSummary = draft.summary.trim().length >= SUMMARY_DETAIL_MIN_LENGTH;
  const isGuidanceOnlyIssue = draft.issueType === 'landlord_dispute';

  if (!hasMonetaryOutcome && isGuidanceOnlyIssue) {
    return 'low';
  }

  let score = BASE_CONFIDENCE_SCORE;

  if (hasMonetaryOutcome) {
    score += 2;
  }

  if (hasDetailedCounterparty) {
    score += 1;
  }

  if (hasDetailedSummary) {
    score += 1;
  }

  if (!isGuidanceOnlyIssue) {
    score += 1;
  }

  if (score >= HIGH_CONFIDENCE_MIN_SCORE && hasMonetaryOutcome) {
    return 'high';
  }

  if (score >= MEDIUM_CONFIDENCE_MIN_SCORE) {
    return 'medium';
  }

  return 'low';
}

function getConfidenceClassName(level: ConfidenceLevel): string {
  const baseClassName =
    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]';

  if (level === 'high') {
    return `${baseClassName} border-emerald-300/40 bg-emerald-300/10 text-emerald-100`;
  }

  if (level === 'medium') {
    return `${baseClassName} border-amber-300/40 bg-amber-300/10 text-amber-100`;
  }

  return `${baseClassName} border-rose-300/40 bg-rose-300/10 text-rose-100`;
}

function getSelectedCategoryLabel(t: FreeStartCopy, selectedCategory: CategoryId | null): string {
  if (selectedCategory) {
    return t(`categories.${selectedCategory}.title`);
  }

  return t('preview.notProvided');
}

type FreeStartMainPanelProps = Readonly<{
  draft: DraftState;
  issueIds: ReadonlyArray<IssueId>;
  selectedCategory: CategoryId | null;
  selectedIssueLabel: string;
  selectedOutcomeLabel: string;
  setDraftField: SetDraftField;
  step: StepId;
  t: FreeStartCopy;
  onBackToCategory: () => void;
  onBackToDetails: () => void;
  onCategorySelect: (category: CategoryId) => void;
  onFinishIntake: () => void;
  onMoveToDetails: () => void;
  onMoveToPreview: () => void;
}>;

function FreeStartMainPanel({
  draft,
  issueIds,
  selectedCategory,
  selectedIssueLabel,
  selectedOutcomeLabel,
  setDraftField,
  step,
  t,
  onBackToCategory,
  onBackToDetails,
  onCategorySelect,
  onFinishIntake,
  onMoveToDetails,
  onMoveToPreview,
}: FreeStartMainPanelProps) {
  if (step === 'category') {
    return (
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
                onClick={() => onCategorySelect(category.id)}
                className={getCategoryCardClassName(isSelected)}
              >
                <span className={getCategoryIconClassName(isSelected)}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="space-y-2">
                  <p className="text-lg font-semibold">{t(`categories.${category.id}.title`)}</p>
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
            onClick={onMoveToDetails}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            {t('choose.continue')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </>
    );
  }

  if (step === 'details') {
    return (
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
                setDraftField('issueType', event.target.value as DraftState['issueType'])
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
              onChange={event => setDraftField('incidentDate', event.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-100">
            <span>{t('details.counterparty')}</span>
            <input
              aria-label={t('details.counterparty')}
              type="text"
              value={draft.counterparty}
              onChange={event => setDraftField('counterparty', event.target.value)}
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
                setDraftField('desiredOutcome', event.target.value as DraftState['desiredOutcome'])
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
            onChange={event => setDraftField('summary', event.target.value)}
            placeholder={t('details.summaryPlaceholder')}
            rows={5}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
          />
        </label>
        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={onBackToCategory}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('details.back')}
          </button>
          <button
            type="button"
            onClick={onMoveToPreview}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            {t('details.continue')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </>
    );
  }

  return (
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
                {getSelectedCategoryLabel(t, selectedCategory)}
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
            <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-200">
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
            onClick={onBackToDetails}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('preview.back')}
          </button>
          <button
            type="button"
            onClick={onFinishIntake}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            {t('preview.finish')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}

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

function FreeStartSidebar({
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

export function FreeStartIntakeShell({
  continueHref,
  locale,
  tenantId,
}: FreeStartIntakeShellProps) {
  const t = useTranslations('freeStart');
  const tCommon = useTranslations('common');
  const contacts = getSupportContacts({ locale, tenantId });
  const [step, setStep] = useState<StepId>('category');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [validationError, setValidationError] = useState<string | null>(null);
  const submissionKeyRef = useRef<string | null>(null);

  const issueIds = getIssueIds(selectedCategory);
  const continueLabel = getContinueLabel(t, continueHref);
  const confidenceLevel = getConfidenceLevel(selectedCategory, draft);
  const activeStepIndex = getActiveStepIndex(step);
  const progressSteps = ['choose', 'details', 'preview'] as const;
  const selectedIssueLabel = getSelectedIssueLabel(t, selectedCategory, draft.issueType);
  const selectedOutcomeLabel = getSelectedOutcomeLabel(t, draft.desiredOutcome);

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

  const finishIntake = async () => {
    if (selectedCategory === null) {
      setValidationError(t('validation.chooseCategory'));
      setStep('category');
      return;
    }

    if (
      draft.issueType.trim().length === 0 ||
      draft.incidentDate.trim().length === 0 ||
      draft.counterparty.trim().length === 0 ||
      draft.desiredOutcome.trim().length === 0 ||
      draft.summary.trim().length === 0
    ) {
      setValidationError(t('validation.completeIntake'));
      return;
    }

    let result: Awaited<ReturnType<typeof submitFreeStartIntake>>;
    const submissionKey = submissionKeyRef.current ?? crypto.randomUUID();
    submissionKeyRef.current = submissionKey;
    try {
      result = await submitFreeStartIntake(
        {
          category: selectedCategory,
          counterparty: draft.counterparty,
          desiredOutcome: draft.desiredOutcome as OutcomeId,
          incidentDate: draft.incidentDate,
          issueType: draft.issueType as IssueId,
          summary: draft.summary,
        },
        submissionKey
      );
    } catch (error) {
      submissionKeyRef.current = null;
      console.error('[FreeStart] Failed to submit intake', error);
      setValidationError(tCommon('errors.retry'));
      return;
    }

    if (!result.success) {
      submissionKeyRef.current = null;
      setValidationError(
        result.code === 'INVALID_PAYLOAD' ? t('validation.completeIntake') : tCommon('errors.retry')
      );
      return;
    }

    CommercialFunnelEvents.freeStartCompleted(
      {
        tenantId,
        variant: resolveFunnelVariant(true),
        locale,
      },
      {
        claim_category: result.data?.claimCategory ?? selectedCategory,
        intake_issue: result.data?.intakeIssue ?? draft.issueType,
        desired_outcome: result.data?.desiredOutcome ?? draft.desiredOutcome,
      }
    );
    submissionKeyRef.current = null;
    setValidationError(null);
    setStep('complete');
  };

  const setDraftField: SetDraftField = (field, value) => {
    setDraft(current => ({
      ...current,
      [field]: value,
    }));
  };

  const handleBackToCategory = () => {
    setValidationError(null);
    setStep('category');
  };

  const handleBackToDetails = () => {
    setValidationError(null);
    setStep('details');
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
                <span key={progressStep} className={getProgressStepClassName(isActive, isComplete)}>
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
            <FreeStartMainPanel
              draft={draft}
              issueIds={issueIds}
              selectedCategory={selectedCategory}
              selectedIssueLabel={selectedIssueLabel}
              selectedOutcomeLabel={selectedOutcomeLabel}
              setDraftField={setDraftField}
              step={step}
              t={t}
              onBackToCategory={handleBackToCategory}
              onBackToDetails={handleBackToDetails}
              onCategorySelect={handleCategorySelect}
              onFinishIntake={finishIntake}
              onMoveToDetails={moveToDetails}
              onMoveToPreview={moveToPreview}
            />
          </div>

          <aside className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            <FreeStartSidebar
              confidenceLevel={confidenceLevel}
              contacts={contacts}
              continueHref={continueHref}
              continueLabel={continueLabel}
              selectedCategory={selectedCategory}
              step={step}
              t={t}
            />
          </aside>
        </div>
      </div>
    </section>
  );
}
