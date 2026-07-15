'use client';

import { getSupportContacts } from '@/lib/support-contacts';
import { useTranslations } from 'next-intl';

import {
  getConfidenceLevel,
  getContinueLabel,
  getIssueIds,
  getSelectedCategoryLabel,
  getSelectedIssueLabel,
  getSelectedOutcomeLabel,
} from './helpers';
import { FreeStartMainPanel } from './main-panel';
import { OrganizerHeader } from './organizer-header';
import { FreeStartSidebar } from './sidebar';
import { TrustBoundary } from './trust-boundary';
import type { FreeStartIntakeShellProps } from './types';
import { useOrganizerFlow } from './use-organizer-flow';
import { useOrganizerSubmit } from './use-organizer-submit';

export function FreeStartIntakeShell(props: FreeStartIntakeShellProps) {
  const t = useTranslations('freeStart');
  const tCommon = useTranslations('common');
  const flow = useOrganizerFlow(props.initialCategory);
  const contacts = getSupportContacts({ locale: props.locale, tenantId: props.tenantId });
  const issueIds = getIssueIds(flow.selectedCategory);
  const categoryLabel = getSelectedCategoryLabel(t, flow.selectedCategory);
  const issueLabel = getSelectedIssueLabel(t, flow.selectedCategory, flow.draft.issueType);
  const outcomeLabel = getSelectedOutcomeLabel(t, flow.draft.desiredOutcome);
  const confidenceLevel = getConfidenceLevel(flow.selectedCategory, flow.draft);
  const continueLabel = getContinueLabel(t, props.continueHref);
  const validationMessage = t('validation.completeIntake');
  const finishIntake = useOrganizerSubmit({
    draft: flow.draft,
    isFinishing: flow.isFinishingIntake,
    locale: props.locale,
    retryMessage: tCommon('errors.retry'),
    selectedCategory: flow.selectedCategory,
    setClaimPack: flow.setClaimPack,
    setError: flow.setValidationError,
    setIsFinishing: flow.setIsFinishingIntake,
    setStep: flow.setStep,
    tenantId: props.tenantId,
    validationMessage,
  });

  return (
    <section
      id="free-start-intake"
      data-testid="free-start-intake-shell"
      className="scroll-mt-24 border-b border-[#001a33]/15 bg-[#f9f6f0] text-[#001a33]"
    >
      <div
        data-testid="premium-free-start-organizer"
        data-save-behavior="temporary"
        className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6 md:py-16"
      >
        <OrganizerHeader step={flow.step} t={t} />
        {flow.validationError ? (
          <p
            ref={flow.validationErrorRef}
            data-testid="free-start-validation-error"
            role="alert"
            tabIndex={-1}
            className="rounded-xl border border-[#a63d50] bg-[#fff0f2] px-4 py-3 text-base font-semibold text-[#7f2436] outline-none focus-visible:ring-3 focus-visible:ring-[#a63d50]"
          >
            {flow.validationError}
          </p>
        ) : null}
        <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-[#001a33]/15 bg-[#fffdf9] p-5 sm:p-7">
            <FreeStartMainPanel
              categoryLabel={categoryLabel}
              draft={flow.draft}
              headingRef={flow.stageHeadingRef}
              issueIds={issueIds}
              issueLabel={issueLabel}
              isFinishing={flow.isFinishingIntake}
              outcomeLabel={outcomeLabel}
              selectedCategory={flow.selectedCategory}
              setDraftField={flow.setDraftField}
              step={flow.step}
              t={t}
              onBackToCategory={() => flow.navigate('category')}
              onBackToDetails={() => flow.navigate('details')}
              onCategorySelect={flow.selectCategory}
              onFinish={finishIntake}
              onMoveToDetails={() => flow.moveToDetails(t('validation.chooseCategory'))}
              onMoveToPreview={() => flow.moveToPreview(validationMessage)}
            />
          </div>
          <aside className="rounded-3xl border border-[#001a33]/15 bg-white p-5 sm:p-6">
            <FreeStartSidebar
              claimPack={flow.claimPack}
              confidenceLevel={confidenceLevel}
              contacts={contacts}
              continueHref={props.continueHref}
              continueLabel={continueLabel}
              selectedCategory={flow.selectedCategory}
              step={flow.step}
              t={t}
            />
          </aside>
        </div>
        <TrustBoundary t={t} />
      </div>
    </section>
  );
}
