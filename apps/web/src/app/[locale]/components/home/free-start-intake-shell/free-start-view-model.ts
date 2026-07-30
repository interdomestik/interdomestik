import { getSupportContacts } from '@/lib/support-contacts';
import { useCallback, useRef, useState } from 'react';

import {
  getConfidenceLevel,
  getContinueLabel,
  getIssueIds,
  getSelectedCategoryLabel,
  getSelectedIssueLabel,
  getSelectedOutcomeLabel,
} from './helpers';
import type { FreeStartCopy, FreeStartIntakeShellProps } from './types';
import type { useOrganizerFlow } from './use-organizer-flow';
import { useOrganizerSubmit } from './use-organizer-submit';

type Args = Readonly<{
  flow: ReturnType<typeof useOrganizerFlow>;
  props: FreeStartIntakeShellProps;
  t: FreeStartCopy;
  tCommon: FreeStartCopy;
}>;

export function useSecureIntentGuard(onVerified: () => Promise<void>) {
  const [epoch, setEpoch] = useState(0),
    epochRef = useRef(0);
  // prettier-ignore
  const invalidate = useCallback(() => { epochRef.current += 1; setEpoch(epochRef.current); }, []);
  // prettier-ignore
  const verify = async () => { if (epochRef.current !== epoch) { throw new Error('secure_save_intent_failed'); } await onVerified(); };
  return { epoch, invalidate, onVerified: verify };
}

export function useFreeStartViewModel({ flow, props, t, tCommon }: Args) {
  const confidenceLevel = getConfidenceLevel(flow.selectedCategory, flow.draft);
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
  return {
    categoryLabel: getSelectedCategoryLabel(t, flow.selectedCategory),
    confidenceLevel,
    contacts: getSupportContacts({ locale: props.locale, tenantId: props.tenantId }),
    continueLabel: getContinueLabel(
      t,
      props.continueHref,
      confidenceLevel === 'high' ? 'high' : 'medium'
    ),
    finishIntake,
    issueIds: getIssueIds(flow.selectedCategory),
    issueLabel: getSelectedIssueLabel(t, flow.selectedCategory, flow.draft.issueType),
    outcomeLabel: getSelectedOutcomeLabel(t, flow.draft.desiredOutcome),
    validationMessage,
  };
}
