'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { AnonymousDraftRecoveryBand } from './anonymous-draft-recovery-band';
import { EMPTY_DRAFT } from './constants';
import { useFreeStartViewModel } from './free-start-view-model';
import { FreeStartMainPanel } from './main-panel';
import { OrganizerHeader } from './organizer-header';
import { FreeStartSidebar } from './sidebar';
import { TrustBoundary } from './trust-boundary';
import type { CategoryId, FreeStartCopy, FreeStartIntakeShellProps } from './types';
import { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';
import { useDraftLifecycle } from './use-draft-lifecycle';
import { useOrganizerFlow } from './use-organizer-flow';

// prettier-ignore
const ClaimPackResult = dynamic(() => import('../claim-pack-result').then(module => module.ClaimPackResult), { ssr: false });
// prettier-ignore
const SecureSaveBand = dynamic(() => import('./secure-save-band').then(module => module.SecureSaveBand), { ssr: false });

// prettier-ignore
export async function resetAfterRecoveryClear(clear: () => Promise<boolean> | boolean, reset: () => void): Promise<boolean> { if (!(await clear())) return false; reset(); return true; }

export function FreeStartIntakeShell(props: FreeStartIntakeShellProps) {
  const t = useTranslations('freeStart');
  const tCommon = useTranslations('common');
  const flow = useOrganizerFlow(props.initialCategory);
  const draftLifecycle = useDraftLifecycle({
    category: flow.selectedCategory,
    draft: flow.draft,
    onReset: flow.resetDraft,
    onResume: flow.resumeDraft,
    step: flow.step,
  });
  const recovery = useAnonymousDraftRecovery({
    activeId: draftLifecycle.active?.id ?? null,
    category: flow.selectedCategory,
    draft: flow.draft,
    lifecycleState: draftLifecycle.state,
    neutralHost: props.neutralOtpHost,
    onReset: draftLifecycle.startAnother,
    onRestore: flow.restoreAnonymousDraft,
    resetCategory: props.initialCategory ?? null,
    step: flow.step,
  });
  const view = useFreeStartViewModel({ flow, props, t, tCommon });
  const recoveryPending = !recovery.ready || Boolean(recovery.offer);
  // prettier-ignore
  const selectCategory = (category: CategoryId) => flow.selectedCategory === 'injury' && (category === 'vehicle' || category === 'property') ? flow.restoreAnonymousDraft({ category, draft: EMPTY_DRAFT, resumeStep: flow.step === 'complete' ? 'preview' : flow.step }) : flow.selectCategory(category);
  const noRecoveryBody = (
    JSON.parse(String(t.raw('secureSaveReviewCopy'))) as { noRecovery: string }
  ).noRecovery;
  const trustBoundaryT: FreeStartCopy = key =>
    key === 'trustBoundary.body' && !recovery.enabled ? noRecoveryBody : t(key);
  // prettier-ignore
  const secureLifecycle = { ...draftLifecycle, startAnother: () => void resetAfterRecoveryClear(recovery.clearBeforeReset, draftLifecycle.startAnother) };

  return (
    <section
      id="free-start-intake"
      data-testid="free-start-intake-shell"
      className="scroll-mt-24 border-b border-[#001a33]/15 bg-[#f9f6f0] text-[#001a33]"
    >
      <div
        data-testid="premium-free-start-organizer"
        data-save-behavior={recovery.enabled ? 'device-recovery' : 'explicit-only'}
        className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6 md:py-16"
      >
        <AnonymousDraftRecoveryBand recovery={recovery} />
        <OrganizerHeader step={flow.step} t={t} />
        <p
          data-testid="free-start-result-announcement"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {flow.step === 'complete' && flow.claimPack ? t('result.announcement') : ''}
        </p>
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
        {flow.step === 'complete' && flow.claimPack ? (
          <div data-testid="free-start-complete" data-layout="full-width">
            <ClaimPackResult
              ctaHref={props.continueHref}
              ctaLabel={view.continueLabel}
              pack={flow.claimPack}
              truthBody={trustBoundaryT('trustBoundary.body')}
            />
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr]">
            {/* prettier-ignore */}
            <div data-testid="free-start-recovery-editor" inert={recoveryPending ? true : undefined} className="rounded-3xl border border-[#001a33]/15 bg-[#fffdf9] p-5 sm:p-7">
              <FreeStartMainPanel
                categoryLabel={view.categoryLabel}
                draft={flow.draft}
                headingRef={flow.stageHeadingRef}
                issueIds={view.issueIds}
                issueLabel={view.issueLabel}
                isFinishing={flow.isFinishingIntake}
                outcomeLabel={view.outcomeLabel}
                selectedCategory={flow.selectedCategory}
                setDraftField={flow.setDraftField}
                step={flow.step}
                t={t}
                onBackToCategory={() => flow.navigate('category')}
                onBackToDetails={() => flow.navigate('details')}
                onCategorySelect={selectCategory}
                onFinish={view.finishIntake}
                onMoveToDetails={() => flow.moveToDetails(t('validation.chooseCategory'))}
                onMoveToPreview={() => flow.moveToPreview(view.validationMessage)}
              />
            </div>
            <aside className="rounded-3xl border border-[#001a33]/15 bg-white p-5 sm:p-6">
              <FreeStartSidebar
                confidenceLevel={view.confidenceLevel}
                contacts={view.contacts}
                continueHref={props.continueHref}
                continueLabel={view.continueLabel}
                selectedCategory={flow.selectedCategory}
                step={flow.step}
                t={t}
              />
            </aside>
          </div>
        )}
        {/* prettier-ignore */}
        <div data-testid="free-start-recovery-secure-actions" inert={recoveryPending ? true : undefined}><SecureSaveBand lifecycle={secureLifecycle} locale={props.locale} neutralOtpHost={props.neutralOtpHost} tenantId={props.neutralOtpTenantId} /></div>
        <TrustBoundary t={trustBoundaryT} />
      </div>
    </section>
  );
}
