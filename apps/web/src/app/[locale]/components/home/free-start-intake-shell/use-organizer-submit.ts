import { generateClaimPackAction } from '@/actions/claim-pack.core';
import { submitFreeStartIntake } from '@/actions/free-start.core';
import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { useCallback, useRef } from 'react';

import { CommercialFunnelEvents, resolveFunnelVariant } from '@/lib/analytics';
import { hasIncompleteDraft } from './intake-validation';
import {
  createUuidV4,
  type CategoryId,
  type DraftState,
  type IssueId,
  type OutcomeId,
  type StepId,
} from './types';

type SubmitOptions = Readonly<{
  draft: DraftState;
  isFinishing: boolean;
  locale: string;
  retryMessage: string;
  selectedCategory: CategoryId | null;
  tenantId?: string | null;
  validationMessage: string;
  setClaimPack: (pack: ClaimPack | null) => void;
  setError: (message: string | null) => void;
  setIsFinishing: (value: boolean) => void;
  setStep: (step: StepId) => void;
}>;

export function useOrganizerSubmit(options: SubmitOptions) {
  const submissionKeyRef = useRef<string | null>(null);

  return useCallback(async () => {
    if (options.isFinishing) return;
    if (!options.selectedCategory || hasIncompleteDraft(options.selectedCategory, options.draft)) {
      options.setError(options.validationMessage);
      return;
    }

    const submissionKey = submissionKeyRef.current ?? createUuidV4();
    submissionKeyRef.current = submissionKey;
    options.setIsFinishing(true);
    let result: Awaited<ReturnType<typeof submitFreeStartIntake>>;

    try {
      result = await submitFreeStartIntake(
        {
          category: options.selectedCategory,
          counterparty: options.draft.counterparty,
          desiredOutcome: options.draft.desiredOutcome as OutcomeId,
          incidentDate: options.draft.incidentDate,
          issueType: options.draft.issueType as IssueId,
          summary: options.draft.summary,
        },
        submissionKey
      );
    } catch (error) {
      console.error('[FreeStart] Failed to submit intake', error);
      submissionKeyRef.current = null;
      options.setError(options.retryMessage);
      options.setIsFinishing(false);
      return;
    }

    if (!result.success) {
      submissionKeyRef.current = null;
      options.setError(
        result.code === 'INVALID_PAYLOAD' ? options.validationMessage : options.retryMessage
      );
      options.setIsFinishing(false);
      return;
    }

    CommercialFunnelEvents.freeStartCompleted(
      { locale: options.locale, tenantId: options.tenantId, variant: resolveFunnelVariant(true) },
      {
        claim_category: result.data?.claimCategory ?? options.selectedCategory,
        desired_outcome: result.data?.desiredOutcome ?? options.draft.desiredOutcome,
        intake_issue: result.data?.intakeIssue ?? options.draft.issueType,
      }
    );
    submissionKeyRef.current = null;
    options.setError(null);
    options.setIsFinishing(false);
    options.setStep('complete');

    void generateClaimPackAction({
      answers: {
        counterpartyName: options.draft.counterparty,
        description: options.draft.summary,
        incidentDate: options.draft.incidentDate,
      },
      claimType: options.selectedCategory,
      locale: options.locale,
    })
      .then(packResult => {
        if (packResult.success) options.setClaimPack(packResult.data);
      })
      .catch(() => undefined);
  }, [options]);
}
