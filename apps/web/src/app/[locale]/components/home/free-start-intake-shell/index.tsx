'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { AnonymousDraftRecoveryBand } from './anonymous-draft-recovery-band';
import {
  BrowserRecoveryDisclosure,
  type BrowserRecoveryDecision,
} from './browser-recovery-disclosure';
import { EMPTY_DRAFT } from './constants';
import { useFreeStartViewModel, useSecureIntentGuard } from './free-start-view-model';
import { FreeStartMainPanel } from './main-panel';
import { OrganizerHeader } from './organizer-header';
// prettier-ignore
import { SAVE_AREA_ID, SaveAreaClose, SecureSaveEntry, parseSaveEntryCopy } from './secure-save-entry';
import { FreeStartSidebar } from './sidebar';
import { TrustBoundary } from './trust-boundary';
// prettier-ignore
import { draftFingerprint, type CategoryId, type FreeStartCopy, type FreeStartOrganizerProps } from './types';
import { UrgentAdvice } from './urgent-advice';
import { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';
import { useDraftLifecycle } from './use-draft-lifecycle';
import { useOrganizerFlow } from './use-organizer-flow';
import { usePublicCategoryIntent } from './use-public-category-intent';
import { usePublicIntakeArrival } from './use-public-intake-arrival';
import { usePublicSaveArea } from './use-public-save-area';
// prettier-ignore
const ClaimPackResult = dynamic(() => import('../claim-pack-result').then(module => module.ClaimPackResult), { ssr: false }), SecureSaveBand = dynamic(() => import('./secure-save-band').then(module => module.SecureSaveBand), { ssr: false });
// prettier-ignore
export async function resetAfterRecoveryClear(clear: () => Promise<boolean> | boolean, reset: () => void): Promise<boolean> { if (!(await clear())) { return false; } reset(); return true; }
export function FreeStartIntakeShell(props: FreeStartOrganizerProps) {
  const t = useTranslations('freeStart'),
    tCommon = useTranslations('common');
  const [recoveryDecision, setRecoveryDecision] = useState<BrowserRecoveryDecision>('pending');
  const arrivalOwnership = useRef(false);
  const flow = useOrganizerFlow(props.initialCategory, arrivalOwnership);
  const draftLifecycle = useDraftLifecycle({
    category: flow.selectedCategory,
    draft: flow.draft,
    onReset: flow.resetDraft,
    onResume: flow.resumeDraft,
    step: flow.step,
  });
  const secureIntent = useSecureIntentGuard(draftLifecycle.onVerified);
  // prettier-ignore
  const recovery = useAnonymousDraftRecovery({
    activeFingerprint: draftLifecycle.active ? draftFingerprint(draftLifecycle.active.category, draftLifecycle.active, draftLifecycle.active.resumeStep) : null,
    activeId: draftLifecycle.active?.id ?? null,
    allowWrites: recoveryDecision === 'enabled',
    category: flow.selectedCategory,
    draft: flow.draft,
    lifecycleState: draftLifecycle.state,
    neutralHost: props.neutralOtpHost,
    onExternalChange: secureIntent.invalidate,
    onReset: draftLifecycle.startAnother,
    onRestore: flow.restoreAnonymousDraft,
    resetCategory: props.initialCategory ?? null,
    step: flow.step,
  });
  // prettier-ignore
  const view = useFreeStartViewModel({ flow, props, t, tCommon }), recoveryPending = !recovery.ready || recovery.busy || Boolean(recovery.offer), secureActionsBlocked = recoveryPending || recovery.state === 'retained';
  const arrival = usePublicIntakeArrival({
    blocked: recoveryPending,
    category: flow.selectedCategory,
    ownership: arrivalOwnership,
    recoveryOffer: Boolean(recovery.offer),
    recoveryBusy: recovery.busy,
    step: flow.step,
  });
  const recoveryView = {
    ...recovery,
    discard: () => {
      secureIntent.invalidate();
      if (recovery.offer || recovery.state === 'conflict' || recovery.state === 'retained') {
        setRecoveryDecision('disabled');
      }
      recovery.discard();
    },
    resume: () => {
      secureIntent.invalidate();
      setRecoveryDecision('enabled');
      recovery.resume();
    },
  };
  // One supported-data boundary for every deliberate situation entry: the organizer category
  // buttons and a public hero selection both land here, and both open the facts directly.
  const enterCategory = (category: CategoryId, arrivalAllowed = true) => {
    arrival.request(category, arrivalAllowed);
    if (category === flow.selectedCategory) {
      // Re-choosing the current situation keeps the typed issue; it is not a category change.
      if (flow.step !== 'details') flow.navigate('details');
      return;
    }
    // Injury-origin notes are never eligible for recovery, so they cannot follow the customer
    // into a vehicle or property entry on a neutral host.
    if (
      recovery.neutralHost &&
      flow.selectedCategory === 'injury' &&
      (category === 'vehicle' || category === 'property')
    ) {
      flow.restoreAnonymousDraft({ category, draft: EMPTY_DRAFT, resumeStep: 'details' });
      return;
    }
    flow.selectCategory(category);
    flow.setStep('details');
  };
  usePublicCategoryIntent({
    // `recovery.busy` covers only the explicit resume/discard actions, never ordinary autosave,
    // so a selection made while one of them runs is consumed instead of replayed afterwards.
    decided: Boolean(recovery.offer) || recovery.busy,
    intent: props.categoryIntent,
    onEnter: enterCategory,
    onDecided: arrival.requestDecision,
    resolved: recovery.ready,
  });
  // The save area is one optional disclosure: closed while facts are entered, revealed directly on
  // review of an admitted situation, and held open by any real save work.
  const saveEntryCopy = parseSaveEntryCopy(t.raw('saveEntry'));
  const {
    neutralFrontDoor,
    saveAvailable,
    reviewingAdmitted,
    saveArea,
    setSaveArea,
    saveAreaRevealed,
    saveAreaCloseable,
    closeSaveArea,
  } = usePublicSaveArea({
    category: flow.selectedCategory,
    step: flow.step,
    lifecycle: draftLifecycle,
    neutralOtpHost: props.neutralOtpHost,
  });
  const noRecoveryBody = (
    JSON.parse(String(t.raw('secureSaveReviewCopy'))) as { noRecovery: string }
  ).noRecovery;
  const trustBoundaryT: FreeStartCopy = key =>
    key === 'trustBoundary.body' && !recovery.enabled ? noRecoveryBody : t(key);
  // prettier-ignore
  const secureLifecycle = { ...draftLifecycle, onVerified: secureIntent.onVerified, startAnother: () => { secureIntent.invalidate(); void resetAfterRecoveryClear(recovery.clearBeforeReset, draftLifecycle.startAnother); } };
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
        <AnonymousDraftRecoveryBand recovery={recoveryView} />
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
        {flow.step === 'details' ? (
          <UrgentAdvice selectedCategory={flow.selectedCategory} t={t} />
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
                narrativeHeadingRef={arrival.headingRef}
                issueIds={view.issueIds}
                issueLabel={view.issueLabel}
                isFinishing={flow.isFinishingIntake}
                outcomeLabel={view.outcomeLabel}
                secondaryFinish={neutralFrontDoor && reviewingAdmitted && !secureActionsBlocked}
                selectedCategory={flow.selectedCategory}
                setDraftField={flow.setDraftField}
                step={flow.step}
                t={t}
                truthBody={trustBoundaryT('trustBoundary.body')}
                onBackToCategory={() => flow.navigate('category')}
                onBackToDetails={() => { arrival.request(flow.selectedCategory); flow.navigate('details'); }}
                onCategorySelect={enterCategory}
                onFinish={view.finishIntake}
                onMoveToDetails={() => { arrival.request(flow.selectedCategory); flow.moveToDetails(t('validation.chooseCategory')); }}
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
        <TrustBoundary t={trustBoundaryT} concise={neutralFrontDoor && saveAvailable} />
        {/* prettier-ignore */}
        <div data-testid="free-start-recovery-secure-actions" aria-describedby={secureActionsBlocked ? 'anonymous-draft-recovery-heading' : undefined} inert={secureActionsBlocked || undefined}>
          {saveAreaRevealed ? null : (
            <SecureSaveEntry
              copy={saveEntryCopy}
              deviceCopyKept={['conflict', 'retained', 'saved'].includes(recovery.state)}
              saveAvailable={saveAvailable}
              restoreFocus={saveArea.focus === 'entry' ? saveArea.opener : 'none'}
              onFocusRestored={() => setSaveArea(current => ({ ...current, focus: 'none' }))}
              onOpen={opener => setSaveArea({ focus: 'area', opener, open: true })}
            />
          )}
          {/* Always present so the optional openers control a real element. */}
          <div id={SAVE_AREA_ID} className="space-y-4">
            {saveAreaRevealed ? (
              <>
                {/* prettier-ignore */}
                <SecureSaveBand allowContinuation key={secureIntent.epoch} lifecycle={secureLifecycle} locale={props.locale} neutralOtpHost={props.neutralOtpHost} onVerifiedOwner={props.onVerifiedOwner} publicPresentation={{ autoFocusHeading: saveArea.focus === 'area', saveAvailable }} tenantId={props.neutralOtpTenantId} />
                {/* The device-storage choice is a separate optional disclosure here: expanding it
                    only reveals the existing facts, and the explicit enable below them stays the
                    one thing that permits a local write. */}
                {recovery.ready &&
                recovery.neutralHost &&
                !recovery.offer &&
                (recovery.state === 'idle' || recovery.state === 'discarded') ? (
                  <BrowserRecoveryDisclosure
                    decision={recoveryDecision}
                    onEnable={() => setRecoveryDecision('enabled')}
                    onSkip={() => setRecoveryDecision('disabled')}
                  />
                ) : null}
                {saveAreaCloseable ? (
                  <SaveAreaClose label={saveEntryCopy.close} onClose={closeSaveArea} />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
