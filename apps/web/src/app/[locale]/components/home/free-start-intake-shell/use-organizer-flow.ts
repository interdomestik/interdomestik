import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { useEffect, useRef, useState } from 'react';

import { EMPTY_DRAFT } from './constants';
import { hasIncompleteDraft } from './intake-validation';
import type { CategoryId, DraftState, SetDraftField, StepId } from './types';

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
    setDraft(current => ({ ...current, [field]: value }));
  };

  const navigate = (nextStep: StepId) => {
    setValidationError(null);
    setStep(nextStep);
  };

  return {
    claimPack,
    draft,
    isFinishingIntake,
    navigate,
    moveToDetails,
    moveToPreview,
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
