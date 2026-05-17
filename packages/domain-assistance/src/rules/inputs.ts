import type {
  AssistanceConsentState,
  AssistanceDisclaimerCode,
  AssistanceEvidenceReference,
  AssistanceOutcome,
  AssistanceOutcomeKind,
  AssistancePackSummary,
  AssistanceProvenance,
  AssistanceReason,
  AssistanceServiceZone,
  CountryRuleMetadata,
  EscalationRecommendation,
  PiiClassification,
} from '../types';

export interface CountryRuleReadinessInput {
  metadata?: CountryRuleMetadata | readonly CountryRuleMetadata[] | null;
  now: Date;
  staleAfterDays?: number;
  minimumConfidence?: number;
  supportedCountry?: boolean;
  scenarioSupported?: boolean;
  conflictingSourceReferences?: readonly string[];
}

export interface CreateAssistanceOutcomeInput {
  kind: AssistanceOutcomeKind;
  zone: AssistanceServiceZone;
  reasons?: readonly AssistanceReason[];
  evidence?: readonly AssistanceEvidenceReference[];
  countryRuleMetadata?: readonly CountryRuleMetadata[];
  humanReviewRequired?: boolean;
  disclaimers?: readonly AssistanceDisclaimerCode[];
  provenance?: AssistanceProvenance;
  piiClassification?: PiiClassification;
  createdAt: string;
  aiFinalDecisionAttempted?: boolean;
}

export interface CreateCountryRuleOutcomeInput extends CountryRuleReadinessInput {
  zone: AssistanceServiceZone;
  createdAt: string;
  readyKind?: Extract<AssistanceOutcomeKind, 'eligible' | 'ineligible' | 'out_of_scope'>;
  evidence?: readonly AssistanceEvidenceReference[];
  provenance?: AssistanceProvenance;
  piiClassification?: PiiClassification;
}

export interface CreateInvalidityReviewBoundaryOutcomeInput {
  zone: AssistanceServiceZone;
  createdAt: string;
  reasons?: readonly AssistanceReason[];
  evidence?: readonly AssistanceEvidenceReference[];
  provenance?: AssistanceProvenance;
}

export interface CreateHelpNowIncidentScenePackInput {
  packId: string;
  sessionId: string;
  country?: string;
  guidanceChecklist: readonly string[];
  escalationRecommendation: EscalationRecommendation;
  createdAt: string;
  provenance?: AssistanceProvenance;
}

export interface CreateAssistanceSessionDigestInput {
  sessionId: string;
  zone: AssistanceServiceZone;
  memberId?: string;
  country?: string;
  packSummaries: readonly AssistancePackSummary[];
  outcomes: readonly AssistanceOutcome[];
  escalationRecommendation: EscalationRecommendation;
  consentState: AssistanceConsentState;
  disclaimersShown?: readonly AssistanceDisclaimerCode[];
  createdAt: string;
}
