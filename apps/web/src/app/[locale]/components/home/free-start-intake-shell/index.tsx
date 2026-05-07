'use client';

import { generateClaimPackAction } from '@/actions/claim-pack.core';
import { submitFreeStartIntake } from '@/actions/free-start.core';
import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { CommercialFunnelEvents, resolveFunnelVariant } from '@/lib/analytics';
import { getSupportContacts } from '@/lib/support-contacts';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import { EMPTY_DRAFT } from './constants';
import {
  getActiveStepIndex,
  getConfidenceLevel,
  getContinueLabel,
  getIssueIds,
  getProgressStepClassName,
  getSelectedIssueLabel,
  getSelectedOutcomeLabel,
} from './helpers';
import { FreeStartMainPanel } from './main-panel';
import { FreeStartSidebar } from './sidebar';
import type {
  CategoryId,
  DraftState,
  FreeStartIntakeShellProps,
  IssueId,
  OutcomeId,
  SetDraftField,
  StepId,
} from './types';

const ClaimPackResultLazy = dynamic(
  () => import('../claim-pack-result').then(mod => ({ default: mod.ClaimPackResult })),
  { ssr: false, loading: () => <div className="animate-pulse h-32 rounded-2xl bg-slate-800" /> }
);

const PROGRESS_STEPS = ['choose', 'details', 'preview'] as const;

function hasIncompleteDraft(selectedCategory: CategoryId | null, draft: DraftState): boolean {
  return (
    selectedCategory === null ||
    draft.issueType.trim().length === 0 ||
    draft.incidentDate.trim().length === 0 ||
    draft.counterparty.trim().length === 0 ||
    draft.desiredOutcome.trim().length === 0 ||
    draft.summary.trim().length === 0
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
  const [isFinishingIntake, setIsFinishingIntake] = useState(false);
  const [claimPack, setClaimPack] = useState<ClaimPack | null>(null);
  const submissionKeyRef = useRef<string | null>(null);
  const validationErrorRef = useRef<HTMLParagraphElement | null>(null);

  const issueIds = getIssueIds(selectedCategory);
  const continueLabel = getContinueLabel(t, continueHref);
  const confidenceLevel = getConfidenceLevel(selectedCategory, draft);
  const activeStepIndex = getActiveStepIndex(step);
  const selectedIssueLabel = getSelectedIssueLabel(t, selectedCategory, draft.issueType);
  const selectedOutcomeLabel = getSelectedOutcomeLabel(t, draft.desiredOutcome);

  useEffect(() => {
    if (validationError) {
      validationErrorRef.current?.focus();
    }
  }, [validationError]);

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
    if (hasIncompleteDraft(selectedCategory, draft)) {
      setValidationError(t('validation.completeIntake'));
      return;
    }

    setValidationError(null);
    setStep('preview');
  };

  const finishIntake = async () => {
    if (isFinishingIntake) {
      return;
    }

    if (selectedCategory === null) {
      setValidationError(t('validation.chooseCategory'));
      setStep('category');
      return;
    }

    if (hasIncompleteDraft(selectedCategory, draft)) {
      setValidationError(t('validation.completeIntake'));
      return;
    }

    let result: Awaited<ReturnType<typeof submitFreeStartIntake>>;
    const submissionKey = submissionKeyRef.current ?? crypto.randomUUID();
    submissionKeyRef.current = submissionKey;
    setIsFinishingIntake(true);
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
      setIsFinishingIntake(false);
      return;
    }

    if (!result.success) {
      submissionKeyRef.current = null;
      setIsFinishingIntake(false);
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
    setIsFinishingIntake(false);
    setStep('complete');

    void generateClaimPackAction({
      claimType: selectedCategory,
      answers: {
        incidentDate: draft.incidentDate,
        description: draft.summary,
        counterpartyName: draft.counterparty,
      },
      locale,
    })
      .then(packResult => {
        if (packResult.success) {
          setClaimPack(packResult.data);
        }
      })
      .catch(() => {
        // Pack generation is non-blocking; the completion state is already shown.
      });
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
            {PROGRESS_STEPS.map((progressStep, index) => {
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
              ref={validationErrorRef}
              data-testid="free-start-validation-error"
              role="alert"
              tabIndex={-1}
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
              isFinishingIntake={isFinishingIntake}
              onMoveToDetails={moveToDetails}
              onMoveToPreview={moveToPreview}
            />
          </div>

          <aside className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
            {step === 'complete' && claimPack ? (
              <>
                <div data-testid="free-start-complete" className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('completion.badge')}
                  </div>
                  <h3 className="text-2xl font-semibold text-white">{t('completion.heading')}</h3>
                  <p className="text-sm leading-6 text-slate-300">{t('completion.body')}</p>
                </div>
                <ClaimPackResultLazy
                  ctaHref={continueHref}
                  ctaLabel={continueLabel}
                  pack={claimPack}
                />
              </>
            ) : (
              <FreeStartSidebar
                confidenceLevel={confidenceLevel}
                contacts={contacts}
                continueHref={continueHref}
                continueLabel={continueLabel}
                selectedCategory={selectedCategory}
                step={step}
                t={t}
              />
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
