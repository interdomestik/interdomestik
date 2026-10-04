import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { EMPTY_DRAFT } from './constants';
import { hasIncompleteDraft } from './intake-validation';
import type { AnonymousDraftSnapshot } from './anonymous-draft-recovery';
import type { CategoryId, DraftState, SavedDraft, SetDraftField, StepId } from './types';

export function useOrganizerFlow(
  initialCategory?: CategoryId,
  detailsArrivalOwned?: RefObject<boolean>
) {
  const [step, setStep] = useState<StepId>(initialCategory ? 'details' : 'category');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(
    initialCategory ?? null
  );
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFinishingIntake, setIsFinishingIntake] = useState(false);
  const [claimPack, setClaimPack] = useState<ClaimPack | null>(null);
  const validationErrorRef = useRef<HTMLParagraphElement | null>(null);
  const stageHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousStepRef = useRef(step);
  const intakeOperationRef = useRef(0);

  useEffect(
    () => () => {
      // Unmount releases UI ownership without cancelling or resending the accepted request.
      intakeOperationRef.current += 1;
    },
    []
  );

  useEffect(() => {
    if (validationError) validationErrorRef.current?.focus();
  }, [validationError]);

  useEffect(() => {
    if (previousStepRef.current !== step && !(step === 'details' && detailsArrivalOwned?.current)) {
      stageHeadingRef.current?.focus();
    }
    previousStepRef.current = step;
  }, [detailsArrivalOwned, step]);

  /**
   * One intake operation owns the completion it started.
   *
   * Releasing hands ownership to the next explicit request: the obsolete result is cleared so it
   * can never reappear for changed facts, and this organizer stops waiting for the operation it
   * was running. The request already sent is never unsent, cancelled or resent.
   */
  const releaseIntakeOperation = () => {
    intakeOperationRef.current += 1;
    setIsFinishingIntake(current => (current ? false : current));
    setClaimPack(current => (current ? null : current));
  };

  const beginIntakeOperation = () => {
    intakeOperationRef.current += 1;
    return intakeOperationRef.current;
  };

  const ownsIntakeOperation = (operation: number) => operation === intakeOperationRef.current;

  const selectCategory = (category: CategoryId) => {
    // A different situation is a different intake: whatever the previous one returns is obsolete.
    releaseIntakeOperation();
    setSelectedCategory(category);
    setDraft(current => ({ ...current, issueType: '' }));
    setValidationError(null);
  };

  const moveToDetails = (message: string) => {
    if (!selectedCategory) return setValidationError(message);
    setValidationError(null);
    setStep('details');
  };

  const moveToPreview = (message: string) => {
    if (hasIncompleteDraft(selectedCategory, draft)) return setValidationError(message);
    setValidationError(null);
    setStep('preview');
  };

  const setDraftField: SetDraftField = (field, value) => {
    // Deliberately editing the facts makes an earlier answer about the previous facts obsolete.
    releaseIntakeOperation();
    setDraft(current => ({ ...current, [field]: value }));
  };

  const navigate = (nextStep: StepId) => {
    // Going back to edit, or re-entering the situation that is already selected, is a deliberate
    // return to the facts; the completion the customer left behind no longer owns this organizer.
    releaseIntakeOperation();
    setValidationError(null);
    setStep(nextStep);
  };

  const resumeDraft = (saved: SavedDraft) => {
    releaseIntakeOperation();
    setSelectedCategory(saved.category);
    setDraft({
      counterparty: saved.counterparty,
      desiredOutcome: saved.desiredOutcome,
      incidentDate: saved.incidentDate,
      issueType: saved.issueType,
      summary: saved.summary,
    });
    setStep(saved.resumeStep);
    setValidationError(null);
  };

  const restoreAnonymousDraft = (saved: AnonymousDraftSnapshot) => {
    releaseIntakeOperation();
    setSelectedCategory(saved.category);
    setDraft(saved.draft);
    setStep(saved.resumeStep);
    setValidationError(null);
  };

  const resetDraft = () => {
    releaseIntakeOperation();
    setSelectedCategory(initialCategory ?? null);
    setDraft(EMPTY_DRAFT);
    setStep(initialCategory ? 'details' : 'category');
    setValidationError(null);
  };

  return {
    beginIntakeOperation,
    claimPack,
    draft,
    isFinishingIntake,
    navigate,
    moveToDetails,
    moveToPreview,
    ownsIntakeOperation,
    resetDraft,
    restoreAnonymousDraft,
    resumeDraft,
    selectedCategory,
    selectCategory,
    setClaimPack,
    setDraftField,
    setIsFinishingIntake,
    setStep,
    setValidationError,
    stageHeadingRef,
    step,
    validationError,
    validationErrorRef,
  };
}
