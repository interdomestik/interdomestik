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
  /** Takes ownership of the organizer for the request this finish is about to send. */
  beginOperation: () => number;
  ownsOperation: (operation: number) => boolean;
  setClaimPack: (pack: ClaimPack | null) => void;
  setError: (message: string | null) => void;
  setIsFinishing: (value: boolean) => void;
  setStep: (step: StepId) => void;
}>;

export function useOrganizerSubmit(options: SubmitOptions) {
  const inFlightOperationRef = useRef<number | null>(null);

  return useCallback(async () => {
    if (options.isFinishing) return;
    // A duplicate finish inside the operation that still owns the organizer is ignored. After a
    // deliberate change the customer may always start a new explicit request: the earlier one is
    // only no longer awaited, never resent and never withdrawn.
    const inFlight = inFlightOperationRef.current;
    if (inFlight !== null && options.ownsOperation(inFlight)) return;
    if (!options.selectedCategory || hasIncompleteDraft(options.selectedCategory, options.draft)) {
      options.setError(options.validationMessage);
      return;
    }

    const operation = options.beginOperation();
    // Each explicit finish carries its own idempotency key, so the server can discard a duplicate
    // of this request without ever deduplicating deliberately changed facts against an older one.
    const submissionKey = createUuidV4();
    const owned = (write: () => void) => {
      if (options.ownsOperation(operation)) write();
    };
    const settle = () => {
      if (inFlightOperationRef.current === operation) inFlightOperationRef.current = null;
    };
    inFlightOperationRef.current = operation;
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
      settle();
      owned(() => {
        options.setError(options.retryMessage);
        options.setIsFinishing(false);
      });
      return;
    }

    if (!result.success) {
      const message =
        result.code === 'INVALID_PAYLOAD' ? options.validationMessage : options.retryMessage;
      settle();
      // A failure the customer has already moved on from must not replace a newer request's error
      // state, nor clear the busy state of the finish that is running now.
      owned(() => {
        options.setError(message);
        options.setIsFinishing(false);
      });
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
    settle();
    // The intake exists now, but only the operation that still owns this organizer may show it:
    // a newer situation, newer facts or a newer finish keeps the editor the customer is using.
    if (!options.ownsOperation(operation)) return;
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
        if (packResult.success) owned(() => options.setClaimPack(packResult.data));
      })
      .catch(() => undefined);
  }, [options]);
}
