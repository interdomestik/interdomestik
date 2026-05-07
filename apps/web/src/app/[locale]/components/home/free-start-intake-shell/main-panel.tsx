import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

import { CATEGORY_CONFIG, OUTCOME_IDS } from './constants';
import {
  getCategoryCardClassName,
  getCategoryIconClassName,
  getSelectedCategoryLabel,
} from './helpers';
import type {
  CategoryId,
  DraftState,
  FreeStartCopy,
  IssueId,
  SetDraftField,
  StepId,
} from './types';

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
  isFinishingIntake: boolean;
  onMoveToDetails: () => void;
  onMoveToPreview: () => void;
}>;

export function FreeStartMainPanel({
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
  isFinishingIntake,
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
            disabled={isFinishingIntake}
            aria-busy={isFinishingIntake}
            onClick={onFinishIntake}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-emerald-400"
          >
            {isFinishingIntake ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('preview.finish')}
            {isFinishingIntake ? null : <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      ) : null}
    </>
  );
}
