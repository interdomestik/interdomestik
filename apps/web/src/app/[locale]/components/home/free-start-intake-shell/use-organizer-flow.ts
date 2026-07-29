import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { useEffect, useRef, useState } from 'react';

import { EMPTY_DRAFT } from './constants';
import { hasIncompleteDraft } from './intake-validation';
import type { AnonymousDraftSnapshot } from './anonymous-draft-recovery';
import type { CategoryId, DraftState, SavedDraft, SetDraftField, StepId } from './types';

export function useOrganizerFlow(initialCategory?: CategoryId) {
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

  useEffect(() => {
    if (validationError) validationErrorRef.current?.focus();
  }, [validationError]);

  useEffect(() => {
    if (previousStepRef.current !== step) stageHeadingRef.current?.focus();
    previousStepRef.current = step;
  }, [step]);

  const selectCategory = (category: CategoryId) => {
    setSelectedCategory(category);
    setDraft(current =>
      selectedCategory === 'injury' && category !== 'injury'
        ? EMPTY_DRAFT
        : { ...current, issueType: '' }
    );
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
    setDraft(current => ({ ...current, [field]: value }));
  };

  const navigate = (nextStep: StepId) => {
    setValidationError(null);
    setStep(nextStep);
  };

  const resumeDraft = (saved: SavedDraft) => {
    setSelectedCategory(saved.category);
    setDraft({
      counterparty: saved.counterparty,
      desiredOutcome: saved.desiredOutcome,
      incidentDate: saved.incidentDate,
      issueType: saved.issueType,
      summary: saved.summary,
    });
    setStep(saved.resumeStep);
    setClaimPack(null);
    setValidationError(null);
  };

  const restoreAnonymousDraft = (saved: AnonymousDraftSnapshot) => {
    setSelectedCategory(saved.category);
    setDraft(saved.draft);
    setStep(saved.resumeStep);
    setClaimPack(null);
    setValidationError(null);
  };

  const resetDraft = () => {
    setSelectedCategory(initialCategory ?? null);
    setDraft(EMPTY_DRAFT);
    setStep(initialCategory ? 'details' : 'category');
    setClaimPack(null);
    setValidationError(null);
    setIsFinishingIntake(false);
  };

  return {
    claimPack,
    draft,
    isFinishingIntake,
    navigate,
    moveToDetails,
    moveToPreview,
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
