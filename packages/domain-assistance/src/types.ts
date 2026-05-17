export const MINIMUM_COUNTRY_RULE_CONFIDENCE = 0.8;

export const ASSISTANCE_OUTCOME_KINDS = [
  'eligible',
  'ineligible',
  'manual_review_required',
  'uncertain',
  'unsupported_country',
  'out_of_scope',
  'requires_member_zone',
  'requires_professional_recovery',
] as const;

export type AssistanceOutcomeKind = (typeof ASSISTANCE_OUTCOME_KINDS)[number];

export const ASSISTANCE_SERVICE_ZONES = ['free', 'member', 'professional_recovery'] as const;

export type AssistanceServiceZone = (typeof ASSISTANCE_SERVICE_ZONES)[number];

export const ASSISTANCE_PACK_TYPES = [
  'incident_scene',
  'legal_basis',
  'procedure',
  'injury_category',
  'vehicle_damage',
  'invalidity_review',
  'recovery_eligibility',
] as const;

export type AssistancePackType = (typeof ASSISTANCE_PACK_TYPES)[number];

export type ProfessionalRecoveryState =
  | 'requested'
  | 'authorization_pending'
  | 'agreement_pending'
  | 'consent_recorded'
  | 'professional_review_pending'
  | 'active_recovery'
  | 'settlement_or_resolution_pending'
  | 'closed';

export type ProfessionalRecoveryActivationRole =
  | 'member'
  | 'staff'
  | 'authorized_professional'
  | 'finance_or_operations';

export type AssistanceDisclaimerCode =
  | 'not_legal_advice'
  | 'not_medical_advice'
  | 'not_insurer_assessment'
  | 'not_professional_opinion'
  | 'educational_only'
  | 'professional_review_required';

export type PiiClassification =
  | 'none'
  | 'identifier_minimal'
  | 'incident_sensitive'
  | 'medical_sensitive'
  | 'legal_financial_sensitive'
  | 'professional_secret';

export type AssistanceEvidenceKind =
  | 'checklist_item'
  | 'country_rule'
  | 'member_statement_summary'
  | 'document_reference'
  | 'professional_review_reference'
  | 'agreement_reference'
  | 'consent_reference'
  | 'finance_audit_reference';

export interface AssistanceEvidenceReference {
  kind: AssistanceEvidenceKind;
  referenceId: string;
  summaryKey?: string;
}

export interface AssistanceReason {
  code: string;
  messageKey?: string;
}

export interface CountryRuleMetadata {
  country: string;
  sourceReference: string;
  owner: string;
  lastReviewed: string;
  confidence: number;
}

export type CountryRuleReadinessKind =
  | 'ready'
  | 'missing'
  | 'stale'
  | 'conflicting'
  | 'unsupported_country'
  | 'unsupported_scenario'
  | 'low_confidence';

export interface CountryRuleReadiness {
  kind: CountryRuleReadinessKind;
  ready: boolean;
  outcomeKind: AssistanceOutcomeKind;
  humanReviewRequired: boolean;
  reasons: readonly AssistanceReason[];
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
}

export type AiAssistanceRole =
  | 'extraction'
  | 'classification'
  | 'summarization'
  | 'draft_organization';

export interface AiAssistanceProvenance {
  aiConfidence: number;
  aiModelVersion: string;
  aiWorkflowName: string;
  aiPromptOrSchemaVersion: string;
  aiRunId?: string;
  role: AiAssistanceRole;
}

export interface AssistanceProvenance {
  source: 'rules' | 'human' | 'ai_assisted';
  generatedBy: 'domain-assistance';
  ai?: AiAssistanceProvenance;
}

export interface AssistanceOutcomeBase {
  kind: AssistanceOutcomeKind;
  zone: AssistanceServiceZone;
  reasons: readonly AssistanceReason[];
  evidence: readonly AssistanceEvidenceReference[];
  countryRuleMetadata: readonly CountryRuleMetadata[];
  humanReviewRequired: boolean;
  disclaimers: readonly AssistanceDisclaimerCode[];
  provenance: AssistanceProvenance;
  piiClassification: PiiClassification;
  createdAt: string;
}

export type AssistanceOutcome =
  | (AssistanceOutcomeBase & { kind: 'eligible' })
  | (AssistanceOutcomeBase & { kind: 'ineligible' })
  | (AssistanceOutcomeBase & { kind: 'manual_review_required' })
  | (AssistanceOutcomeBase & { kind: 'uncertain' })
  | (AssistanceOutcomeBase & { kind: 'unsupported_country' })
  | (AssistanceOutcomeBase & { kind: 'out_of_scope' })
  | (AssistanceOutcomeBase & { kind: 'requires_member_zone' })
  | (AssistanceOutcomeBase & { kind: 'requires_professional_recovery' });

export interface AssistancePackBase<
  TPackType extends AssistancePackType = AssistancePackType,
  TZone extends AssistanceServiceZone = AssistanceServiceZone,
> {
  packId: string;
  packType: TPackType;
  outcome: AssistanceOutcome & { zone: TZone };
  zone: TZone;
  inputsSummary: readonly AssistanceReason[];
  requiredDisclaimers: readonly AssistanceDisclaimerCode[];
  requiredHumanReview: boolean;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  piiClassification: PiiClassification;
  retentionPolicyKey: string;
  provenance: AssistanceProvenance;
}

export interface IncidentScenePack extends AssistancePackBase<'incident_scene', 'free'> {
  guidanceChecklist: readonly string[];
  escalationRecommendation: EscalationRecommendation;
}

export interface LegalBasisPack extends AssistancePackBase<'legal_basis', 'member'> {
  legalBasisCodes: readonly string[];
}

export interface ProcedurePack extends AssistancePackBase<'procedure', 'member'> {
  procedureCodes: readonly string[];
  deadlineReferences: readonly AssistanceEvidenceReference[];
}

export interface InjuryCategoryPack extends AssistancePackBase<'injury_category', 'member'> {
  categoryCodes: readonly string[];
}

export interface VehicleDamagePack extends AssistancePackBase<'vehicle_damage', 'member'> {
  damageCategoryCodes: readonly string[];
}

export interface InvalidityReviewPack extends AssistancePackBase<'invalidity_review', 'member'> {
  reviewRequiredReasonCodes: readonly string[];
}

export interface RecoveryEligibilityPack extends AssistancePackBase<
  'recovery_eligibility',
  'member' | 'professional_recovery'
> {
  recoveryPrerequisiteCodes: readonly string[];
}

export type EscalationRecommendation =
  | 'none'
  | 'member_zone'
  | 'staff_handoff'
  | 'professional_recovery'
  | 'emergency_services';

export type AssistanceConsentState =
  | 'anonymous'
  | 'not_requested'
  | 'declined'
  | 'explicit_consent_recorded';

export interface AssistancePackSummary {
  packId: string;
  packType: AssistancePackType;
  outcomeKind: AssistanceOutcomeKind;
  zone: AssistanceServiceZone;
  requiredHumanReview: boolean;
}

export interface AssistanceSessionDigest {
  sessionId: string;
  zone: AssistanceServiceZone;
  memberId?: string;
  country?: string;
  packSummaries: readonly AssistancePackSummary[];
  outcomes: readonly AssistanceOutcome[];
  escalationRecommendation: EscalationRecommendation;
  consentState: AssistanceConsentState;
  requiredHumanReview: boolean;
  disclaimersShown: readonly AssistanceDisclaimerCode[];
  countryRuleMetadata: readonly CountryRuleMetadata[];
  aiProvenance: readonly AiAssistanceProvenance[];
  piiClassification: PiiClassification;
  createdAt: string;
  externalRecordIds?: never;
  createdRecordIds?: never;
}
