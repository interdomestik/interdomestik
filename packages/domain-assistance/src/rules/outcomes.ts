import type { AssistanceOutcome } from '../types';
import { DEFAULT_ASSISTANCE_PROVENANCE, AI_FINAL_DECISION_ALLOWED } from './constants';
import { getRequiredDisclaimerCodes } from './disclaimers';
import type { CreateAssistanceOutcomeInput } from './inputs';

export function isAiFinalDecisionAllowed(): false {
  return AI_FINAL_DECISION_ALLOWED;
}

export function createAssistanceOutcome(input: CreateAssistanceOutcomeInput): AssistanceOutcome {
  const provenance = input.provenance ?? DEFAULT_ASSISTANCE_PROVENANCE;
  const aiFinalDecisionAttempted =
    input.aiFinalDecisionAttempted === true ||
    (provenance.source === 'ai_assisted' && input.humanReviewRequired !== true);
  const kind = aiFinalDecisionAttempted ? 'manual_review_required' : input.kind;
  const reasons = [
    ...(input.reasons ?? []),
    ...(aiFinalDecisionAttempted
      ? [
          {
            code: 'ai_final_decision_blocked',
            messageKey: 'assistance.ai.finalDecisionBlocked',
          },
        ]
      : []),
  ];

  return {
    kind,
    zone: input.zone,
    reasons,
    evidence: input.evidence ?? [],
    countryRuleMetadata: input.countryRuleMetadata ?? [],
    humanReviewRequired: input.humanReviewRequired === true || aiFinalDecisionAttempted,
    disclaimers: input.disclaimers ?? getRequiredDisclaimerCodes(input.zone),
    provenance,
    piiClassification: input.piiClassification ?? 'identifier_minimal',
    createdAt: input.createdAt,
  } as AssistanceOutcome;
}
