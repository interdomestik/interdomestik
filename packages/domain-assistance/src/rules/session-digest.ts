import type {
  AiAssistanceProvenance,
  AssistanceDisclaimerCode,
  AssistanceOutcome,
  AssistanceSessionDigest,
  PiiClassification,
} from '../types';
import type { CreateAssistanceSessionDigestInput } from './inputs';

export function createAssistanceSessionDigest(
  input: CreateAssistanceSessionDigestInput
): AssistanceSessionDigest {
  const outcomes = input.outcomes;
  const aiProvenance = outcomes
    .map(outcome => outcome.provenance.ai)
    .filter((ai): ai is AiAssistanceProvenance => ai !== undefined);

  return {
    sessionId: input.sessionId,
    zone: input.zone,
    ...(input.consentState === 'explicit_consent_recorded' && input.memberId
      ? { memberId: input.memberId }
      : {}),
    country: input.country,
    packSummaries: input.packSummaries,
    outcomes,
    escalationRecommendation: input.escalationRecommendation,
    consentState: input.consentState,
    requiredHumanReview: outcomes.some(outcome => outcome.humanReviewRequired),
    disclaimersShown: input.disclaimersShown ?? collectDisclaimers(outcomes),
    countryRuleMetadata: outcomes.flatMap(outcome => outcome.countryRuleMetadata),
    aiProvenance,
    piiClassification: highestPiiClassification(outcomes.map(outcome => outcome.piiClassification)),
    createdAt: input.createdAt,
  };
}

function collectDisclaimers(
  outcomes: readonly AssistanceOutcome[]
): readonly AssistanceDisclaimerCode[] {
  return [...new Set(outcomes.flatMap(outcome => outcome.disclaimers))];
}

function highestPiiClassification(values: readonly PiiClassification[]): PiiClassification {
  const priority: Record<PiiClassification, number> = {
    none: 0,
    identifier_minimal: 1,
    incident_sensitive: 2,
    medical_sensitive: 3,
    legal_financial_sensitive: 4,
    professional_secret: 5,
  };

  return values.reduce<PiiClassification>(
    (highest, current) => (priority[current] > priority[highest] ? current : highest),
    'none'
  );
}
