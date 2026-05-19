import type {
  AssistanceDisclaimerCode,
  AssistanceEvidenceKind,
  AssistanceEvidenceReference,
  AssistanceOutcome,
  AssistanceOutcomeKind,
  AssistanceProvenance,
  AssistanceReason,
  AssistanceServiceZone,
  CountryRuleMetadata,
  InvalidityReviewPack,
  PiiClassification,
} from '../types';
import { DEFAULT_ASSISTANCE_PROVENANCE } from './constants';
import { evaluateCountryRuleReadiness } from './country-rules';
import { getRequiredDisclaimerCodes } from './disclaimers';
import { createInvalidityReviewBoundaryOutcome } from './human-review';
import { createAssistanceOutcome } from './outcomes';
import {
  isFilled,
  isFiniteConfidence,
  minimumCountryRuleConfidence,
  normalizeCountry,
  normalizeStaleAfterDays,
  uniqueNonEmptyStrings,
} from './rule-utils';

export const INVALIDITY_REVIEW_RULE_FAMILIES = ['invalidity_review'] as const;

export type InvalidityReviewRuleFamily = (typeof INVALIDITY_REVIEW_RULE_FAMILIES)[number];

export const INVALIDITY_REVIEW_SCENARIOS = [
  'traffic_injury_invalidity',
  'cross_border_traffic_injury_invalidity',
  'green_card_vehicle_invalidity',
  'non_vehicle_injury_invalidity',
] as const;

export type InvalidityReviewScenario = (typeof INVALIDITY_REVIEW_SCENARIOS)[number];

export const INVALIDITY_REVIEW_PARTICIPANT_ROLES = [
  'member_driver',
  'member_passenger',
  'member_pedestrian',
  'member_cyclist',
  'member_claimant',
] as const;

export type InvalidityReviewParticipantRole = (typeof INVALIDITY_REVIEW_PARTICIPANT_ROLES)[number];

export const INVALIDITY_REVIEW_REASON_CODES = [
  'injury_category_review_required',
  'functional_limitation_review_required',
  'treatment_course_review_required',
  'cross_border_invalidity_review_required',
  'vehicle_context_review_required',
  'expert_human_review_required',
] as const;

export type InvalidityReviewReasonCode = (typeof INVALIDITY_REVIEW_REASON_CODES)[number];

export const INVALIDITY_PREREQUISITE_STATUS_CODES = [
  'injury_category_reference_present',
  'vehicle_damage_reference_present',
  'medical_document_reference_present',
  'consent_reference_present',
  'jurisdiction_reference_present',
] as const;

export type InvalidityPrerequisiteStatusCode =
  (typeof INVALIDITY_PREREQUISITE_STATUS_CODES)[number];

export const INVALIDITY_REVIEW_PRIVACY_ALIGNMENT = {
  processingPurpose: 'invalidity_review',
  aiExtractionProcessingPurpose: 'ai_document_extraction',
  medicalDocumentConsentType: 'medical_document_processing',
  aiExtractionConsentType: 'ai_document_extraction',
  article9Basis: 'explicit_consent',
  sensitiveHealthDocumentSensitivity: 'sensitive_health',
  ordinaryDocumentSensitivity: 'personal',
  legalDocumentSensitivity: 'legal_professional_recovery',
  redactionPosture: 'structured_references_only',
  aiPosture: 'non_final_no_training_zero_retention_human_review',
  retentionPolicyKey: 'member_assistance_invalidity_review_v1',
} as const;

export type InvalidityDocumentSensitivityClass =
  | typeof INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.sensitiveHealthDocumentSensitivity
  | typeof INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.ordinaryDocumentSensitivity
  | typeof INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.legalDocumentSensitivity;

export const INVALIDITY_REVIEW_REQUIRED_DISCLAIMERS = [
  ...getRequiredDisclaimerCodes('member'),
] as const satisfies readonly AssistanceDisclaimerCode[];

const ASSISTANCE_EVIDENCE_KINDS = [
  'checklist_item',
  'country_rule',
  'member_statement_summary',
  'document_reference',
  'professional_review_reference',
  'agreement_reference',
  'consent_reference',
  'finance_audit_reference',
] as const satisfies readonly AssistanceEvidenceKind[];

const COUNTRY_METADATA_TEXT_FIELDS = [
  'country',
  'sourceReference',
  'owner',
  'lastReviewed',
] as const satisfies readonly (keyof CountryRuleMetadata)[];

export type InvalidityReviewReadinessKind =
  | 'ready'
  | 'requires_member_zone'
  | 'requires_professional_recovery'
  | 'missing_jurisdiction'
  | 'jurisdiction_tie_breaker_missing'
  | 'missing_rule'
  | 'metadata_incomplete'
  | 'stale'
  | 'conflicting'
  | 'unsupported_country'
  | 'unsupported_scenario'
  | 'unsupported_role'
  | 'unsupported_rule_family'
  | 'unsupported_prerequisite_code'
  | 'unsupported_review_reason'
  | 'unsupported_evidence_type'
  | 'low_confidence'
  | 'prerequisite_matrix_incomplete'
  | 'injury_prerequisite_missing'
  | 'vehicle_prerequisite_missing'
  | 'medical_document_consent_missing'
  | 'article_9_consent_missing'
  | 'document_processing_consent_missing'
  | 'ai_extraction_consent_missing'
  | 'ai_posture_incomplete'
  | 'out_of_scope'
  | 'professional_review_required';

export type InvalidityReviewCountryRuleMetadataInput = Partial<CountryRuleMetadata>;

export interface InvalidityReviewEvidenceReferenceInput extends AssistanceEvidenceReference {
  kind: AssistanceEvidenceKind;
  referenceId: string;
  documentSensitivityClass?: InvalidityDocumentSensitivityClass;
  processingPurpose?: typeof INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.processingPurpose;
  sourceReference?: string;
  lastReviewed?: string;
  confidence?: number;
}

export interface InvalidityReviewEvidenceReference extends AssistanceEvidenceReference {
  kind: AssistanceEvidenceKind;
  referenceId: string;
  documentSensitivityClass: InvalidityDocumentSensitivityClass;
  processingPurpose: typeof INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.processingPurpose;
  sourceReference: string;
  lastReviewed: string;
  confidence: number;
}

export interface InvalidityPrerequisiteReferenceInput {
  packType: 'injury_category' | 'vehicle_damage';
  packId: string;
  referenceId?: string;
  statusCode: InvalidityPrerequisiteStatusCode | string;
  sourceReference?: string;
  lastReviewed?: string;
  confidence?: number;
}

export interface InvalidityReviewRuleInput {
  country: string;
  scenario: InvalidityReviewScenario;
  participantRole: InvalidityReviewParticipantRole;
  ruleFamily: InvalidityReviewRuleFamily;
  metadata?: InvalidityReviewCountryRuleMetadataInput | null;
  supportedCountry?: boolean;
  scenarioSupported?: boolean;
  roleSupported?: boolean;
  ruleFamilySupported?: boolean;
  reviewReasonCodes?: readonly string[];
  prerequisiteStatusCodes?: readonly string[];
  evidenceReferences?: readonly InvalidityReviewEvidenceReferenceInput[];
  evidenceKindsSupported?: readonly AssistanceEvidenceKind[];
  documentSensitivityClass?: InvalidityDocumentSensitivityClass;
  requiresProfessionalRecovery?: boolean;
  requiresProfessionalReview?: boolean;
  requiresMedicalDiagnosis?: boolean;
  requiresPrognosis?: boolean;
  requiresTreatmentAdvice?: boolean;
  requiresInvalidityCoefficientCalculation?: boolean;
  requiresCompensationValuation?: boolean;
  requiresInsurerLiabilityAssessment?: boolean;
  requiresInsurerCoverageDecision?: boolean;
  requiresFraudDetermination?: boolean;
  requiresSettlementStrategy?: boolean;
  requiresLegalAdvice?: boolean;
}

export interface InvalidityReviewReadinessInput {
  zone: AssistanceServiceZone;
  applicableJurisdictionCountry?: string;
  incidentCountry?: string;
  memberResidenceCountry?: string;
  treatmentCountry?: string;
  vehicleRegistrationCountry?: string;
  insurerCountry?: string;
  jurisdictionTieBreakerReason?: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  prerequisiteReferences: readonly InvalidityPrerequisiteReferenceInput[];
  rules: readonly InvalidityReviewRuleInput[];
  now: Date;
  staleAfterDays?: number;
  minimumConfidence?: number;
  conflictingSourceReferences?: readonly string[];
  prerequisiteMatrixMetadataComplete?: boolean;
  medicalDocumentConsentRecorded?: boolean;
  article9ExplicitConsentRecorded?: boolean;
  documentProcessingConsentRecorded?: boolean;
  aiExtractionRequested?: boolean;
  aiExtractionConsentRecorded?: boolean;
  aiAssistedEvidenceUsed?: boolean;
  aiNoTrainingConfirmed?: boolean;
  aiZeroRetentionConfirmed?: boolean;
  aiNonFinalConfirmed?: boolean;
  aiHumanReviewConfirmed?: boolean;
  documentEvidenceIncluded?: boolean;
  vehicleDamageEvidenceIncluded?: boolean;
  vehicleRegistrationEvidenceIncluded?: boolean;
  plateOrVinDerivedEvidenceIncluded?: boolean;
  insurerVehicleCorrespondenceIncluded?: boolean;
  repairEvidenceIncluded?: boolean;
  towingEvidenceIncluded?: boolean;
  bureauEvidenceIncluded?: boolean;
  trafficIncidentEvidenceIncluded?: boolean;
  requiresProfessionalRecovery?: boolean;
  requiresMedicalDiagnosis?: boolean;
  requiresPrognosis?: boolean;
  requiresTreatmentAdvice?: boolean;
  requiresInvalidityCoefficientCalculation?: boolean;
  requiresCompensationValuation?: boolean;
  requiresInsurerLiabilityAssessment?: boolean;
  requiresInsurerCoverageDecision?: boolean;
  requiresFraudDetermination?: boolean;
  requiresSettlementStrategy?: boolean;
  requiresLegalAdvice?: boolean;
}

export interface InvalidityReviewReadiness {
  kind: InvalidityReviewReadinessKind;
  ready: boolean;
  outcomeKind: AssistanceOutcomeKind;
  humanReviewRequired: true;
  reasons: readonly AssistanceReason[];
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  applicableJurisdictionCountry: string;
  incidentCountry: string;
  memberResidenceCountry: string;
  treatmentCountry: string;
  vehicleRegistrationCountry: string;
  insurerCountry: string;
  jurisdictionTieBreakerReason?: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  reviewRequiredReasonCodes: readonly InvalidityReviewReasonCode[];
  prerequisiteStatusCodes: readonly InvalidityPrerequisiteStatusCode[];
  prerequisiteReferences: readonly InvalidityPrerequisiteReferenceInput[];
  evidenceReferences: readonly InvalidityReviewEvidenceReference[];
  requiredDisclaimers: readonly AssistanceDisclaimerCode[];
  privacyAlignment: typeof INVALIDITY_REVIEW_PRIVACY_ALIGNMENT;
  documentSensitivityClass: InvalidityDocumentSensitivityClass;
  piiClassification: Extract<PiiClassification, 'medical_sensitive'>;
}

export interface InvalidityCoefficientReviewPack extends InvalidityReviewPack {
  reviewRequiredReasonCodes: readonly InvalidityReviewReasonCode[];
  prerequisiteStatusCodes: readonly InvalidityPrerequisiteStatusCode[];
  prerequisiteReferences: readonly InvalidityPrerequisiteReferenceInput[];
  evidenceReferences: readonly InvalidityReviewEvidenceReference[];
  privacyAlignment: typeof INVALIDITY_REVIEW_PRIVACY_ALIGNMENT;
  documentSensitivityClass: InvalidityDocumentSensitivityClass;
}

export interface CreateInvalidityReviewPackInput extends Omit<
  InvalidityReviewReadinessInput,
  'zone'
> {
  packId: string;
  createdAt: string;
  evidence?: readonly AssistanceEvidenceReference[];
  provenance?: AssistanceProvenance;
}

type CloseInvalidityReadiness = (
  kind: Exclude<InvalidityReviewReadinessKind, 'ready'>,
  outcomeKind: AssistanceOutcomeKind,
  countryRuleMetadata?: readonly CountryRuleMetadata[]
) => InvalidityReviewReadiness;

export function evaluateInvalidityReview(
  input: InvalidityReviewReadinessInput
): InvalidityReviewReadiness {
  const minimumConfidence = minimumInvalidityConfidence(input.minimumConfidence);
  const applicableJurisdictionCountry = normalizeCountry(input.applicableJurisdictionCountry);
  const incidentCountry = normalizeCountry(input.incidentCountry) || applicableJurisdictionCountry;
  const memberResidenceCountry = normalizeCountry(input.memberResidenceCountry);
  const treatmentCountry = normalizeCountry(input.treatmentCountry);
  const vehicleRegistrationCountry = normalizeCountry(input.vehicleRegistrationCountry);
  const insurerCountry = normalizeCountry(input.insurerCountry);
  const metadata = completeMetadataFromRules(input.rules);
  const base = invalidityReadinessContext(input, {
    minimumConfidence,
    applicableJurisdictionCountry,
    incidentCountry,
    memberResidenceCountry,
    treatmentCountry,
    vehicleRegistrationCountry,
    insurerCountry,
    countryRuleMetadata: metadata,
    documentSensitivityClass: inferDocumentSensitivityClass(input.rules),
  });
  const closed = (
    kind: Exclude<InvalidityReviewReadinessKind, 'ready'>,
    outcomeKind: AssistanceOutcomeKind,
    countryRuleMetadata: readonly CountryRuleMetadata[] = base.countryRuleMetadata
  ) => {
    return invalidityReadiness({
      ...base,
      countryRuleMetadata,
      kind,
      outcomeKind,
    });
  };

  const inputFailure = invalidityInputFailure(input, base, closed);
  if (inputFailure != null) {
    return inputFailure;
  }

  const prerequisiteFailure = invalidityPrerequisiteFailure(input, closed);
  if (prerequisiteFailure != null) {
    return prerequisiteFailure;
  }

  const applicableRules = input.rules.filter(rule =>
    isApplicableRule(rule, input, applicableJurisdictionCountry)
  );

  const ruleSelectionFailure = invalidityRuleSelectionFailure(applicableRules, closed);
  if (ruleSelectionFailure != null) {
    return ruleSelectionFailure;
  }

  const applicableMetadata = applicableRules.map(rule => rule.metadata as CountryRuleMetadata);
  const conflictingSourceReferences = invalidityConflictingSourceReferences({
    explicitReferences: input.conflictingSourceReferences,
    applicableRules,
    applicableJurisdictionCountry,
  });

  const applicableRuleFailure = invalidityApplicableRuleFailure(
    applicableRules,
    applicableMetadata,
    closed
  );
  if (applicableRuleFailure != null) {
    return applicableRuleFailure;
  }

  const countryRuleReadiness = evaluateCountryRuleReadiness({
    conflictingSourceReferences,
    scenarioSupported: applicableRules.every(rule => rule.scenarioSupported !== false),
    supportedCountry: applicableRules.every(rule => rule.supportedCountry !== false),
    minimumConfidence,
    staleAfterDays: normalizeStaleAfterDays(input.staleAfterDays),
    now: input.now,
    metadata: applicableMetadata,
  });

  if (countryRuleReadiness.kind !== 'ready') {
    return invalidityCountryRuleFailure(base, countryRuleReadiness);
  }

  const reviewRequiredReasonCodes = uniqueNonEmptyStrings(
    applicableRules.flatMap(rule => rule.reviewReasonCodes ?? [])
  );
  const prerequisiteStatusCodes = uniqueNonEmptyStrings([
    ...applicableRules.flatMap(rule => rule.prerequisiteStatusCodes ?? []),
    ...input.prerequisiteReferences.map(reference => reference.statusCode),
  ]);

  const outputFailure = invalidityOutputFailure(
    {
      reviewRequiredReasonCodes,
      prerequisiteStatusCodes,
      applicableRules,
      countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
    },
    closed
  );
  if (outputFailure != null) {
    return outputFailure;
  }

  const evidenceReferences = uniqueEvidenceReferences(
    applicableRules.flatMap(rule => rule.evidenceReferences ?? []),
    inferDocumentSensitivityClass(applicableRules)
  );

  return {
    ...base,
    kind: 'ready',
    ready: true,
    outcomeKind: 'manual_review_required',
    humanReviewRequired: true,
    reasons: [
      {
        code: 'invalidity_review_human_review_required',
        messageKey: 'assistance.invalidity.humanReviewRequired',
      },
    ],
    minimumConfidence: countryRuleReadiness.minimumConfidence,
    countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
    reviewRequiredReasonCodes: reviewRequiredReasonCodes as readonly InvalidityReviewReasonCode[],
    prerequisiteStatusCodes: prerequisiteStatusCodes as readonly InvalidityPrerequisiteStatusCode[],
    prerequisiteReferences: input.prerequisiteReferences,
    evidenceReferences,
    requiredDisclaimers: INVALIDITY_REVIEW_REQUIRED_DISCLAIMERS,
    privacyAlignment: INVALIDITY_REVIEW_PRIVACY_ALIGNMENT,
    piiClassification: 'medical_sensitive',
  };
}

function invalidityInputFailure(
  input: InvalidityReviewReadinessInput,
  base: Pick<
    InvalidityReviewReadiness,
    | 'applicableJurisdictionCountry'
    | 'incidentCountry'
    | 'memberResidenceCountry'
    | 'treatmentCountry'
    | 'vehicleRegistrationCountry'
    | 'insurerCountry'
  >,
  closed: CloseInvalidityReadiness
): InvalidityReviewReadiness | null {
  if (input.zone === 'professional_recovery' || input.requiresProfessionalRecovery === true) {
    return closed('requires_professional_recovery', 'requires_professional_recovery');
  }

  if (input.zone !== 'member') {
    return closed('requires_member_zone', 'requires_member_zone');
  }

  if (base.applicableJurisdictionCountry.length === 0) {
    return closed('missing_jurisdiction', 'manual_review_required');
  }

  if (jurisdictionTieBreakerRequired(base) && !isFilled(input.jurisdictionTieBreakerReason)) {
    return closed('jurisdiction_tie_breaker_missing', 'manual_review_required');
  }

  if (!isInvalidityReviewRuleFamily(input.requestedRuleFamily)) {
    return closed('unsupported_rule_family', 'uncertain');
  }

  if (!isInvalidityReviewScenario(input.scenario)) {
    return closed('unsupported_scenario', 'uncertain');
  }

  if (!isInvalidityReviewParticipantRole(input.participantRole)) {
    return closed('unsupported_role', 'uncertain');
  }

  if (input.prerequisiteMatrixMetadataComplete === false) {
    return closed('prerequisite_matrix_incomplete', 'manual_review_required');
  }

  return invalidityConsentOrScopeFailure(input, closed);
}

function invalidityConsentOrScopeFailure(
  input: InvalidityReviewReadinessInput,
  closed: CloseInvalidityReadiness
): InvalidityReviewReadiness | null {
  if (isOutOfScopeInvalidityAssessment(input)) {
    return closed('out_of_scope', 'out_of_scope');
  }

  if (input.medicalDocumentConsentRecorded !== true) {
    return closed('medical_document_consent_missing', 'manual_review_required');
  }

  if (input.article9ExplicitConsentRecorded !== true) {
    return closed('article_9_consent_missing', 'manual_review_required');
  }

  if (
    invalidityDocumentProcessingConsentRequired(input) &&
    input.documentProcessingConsentRecorded !== true
  ) {
    return closed('document_processing_consent_missing', 'manual_review_required');
  }

  if (input.aiExtractionRequested === true && input.aiExtractionConsentRecorded !== true) {
    return closed('ai_extraction_consent_missing', 'manual_review_required');
  }

  if (
    (input.aiExtractionRequested === true || input.aiAssistedEvidenceUsed === true) &&
    (input.aiNoTrainingConfirmed !== true ||
      input.aiZeroRetentionConfirmed !== true ||
      input.aiNonFinalConfirmed !== true ||
      input.aiHumanReviewConfirmed !== true)
  ) {
    return closed('ai_posture_incomplete', 'manual_review_required');
  }

  return null;
}

function invalidityPrerequisiteFailure(
  input: InvalidityReviewReadinessInput,
  closed: CloseInvalidityReadiness
): InvalidityReviewReadiness | null {
  if (
    input.prerequisiteReferences.some(
      reference => !isInvalidityPrerequisiteStatusCode(reference.statusCode)
    )
  ) {
    return closed('unsupported_prerequisite_code', 'manual_review_required');
  }

  if (input.prerequisiteReferences.some(reference => !isCompletePrerequisiteReference(reference))) {
    return closed('prerequisite_matrix_incomplete', 'manual_review_required');
  }

  if (!input.prerequisiteReferences.some(reference => reference.packType === 'injury_category')) {
    return closed('injury_prerequisite_missing', 'manual_review_required');
  }

  if (
    invalidityVehicleContextRequired(input) &&
    !input.prerequisiteReferences.some(reference => reference.packType === 'vehicle_damage')
  ) {
    return closed('vehicle_prerequisite_missing', 'manual_review_required');
  }

  return null;
}

function invalidityRuleSelectionFailure(
  applicableRules: readonly InvalidityReviewRuleInput[],
  closed: CloseInvalidityReadiness
): InvalidityReviewReadiness | null {
  if (applicableRules.length === 0) {
    return closed('missing_rule', 'manual_review_required');
  }

  if (applicableRules.some(rule => !isCompleteCountryRuleMetadata(rule.metadata))) {
    return closed('metadata_incomplete', 'manual_review_required');
  }

  return null;
}

function invalidityApplicableRuleFailure(
  applicableRules: readonly InvalidityReviewRuleInput[],
  applicableMetadata: readonly CountryRuleMetadata[],
  closed: CloseInvalidityReadiness
): InvalidityReviewReadiness | null {
  if (applicableRules.some(rule => rule.requiresProfessionalRecovery === true)) {
    return closed(
      'requires_professional_recovery',
      'requires_professional_recovery',
      applicableMetadata
    );
  }

  if (applicableRules.some(rule => rule.ruleFamilySupported === false)) {
    return closed('unsupported_rule_family', 'uncertain', applicableMetadata);
  }

  if (applicableRules.some(rule => rule.roleSupported === false)) {
    return closed('unsupported_role', 'uncertain', applicableMetadata);
  }

  if (applicableRules.some(isOutOfScopeInvalidityAssessment)) {
    return closed('out_of_scope', 'out_of_scope', applicableMetadata);
  }

  if (applicableRules.some(rule => rule.requiresProfessionalReview === true)) {
    return closed('professional_review_required', 'manual_review_required', applicableMetadata);
  }

  return null;
}

function invalidityCountryRuleFailure(
  base: ReturnType<typeof invalidityReadinessContext>,
  countryRuleReadiness: ReturnType<typeof evaluateCountryRuleReadiness>
): InvalidityReviewReadiness {
  return {
    ...base,
    kind: invalidityKindFromCountryRule(
      countryRuleReadiness.kind as Exclude<
        ReturnType<typeof evaluateCountryRuleReadiness>['kind'],
        'ready'
      >
    ),
    ready: false,
    outcomeKind: countryRuleReadiness.outcomeKind,
    humanReviewRequired: true,
    reasons: countryRuleReadiness.reasons,
    minimumConfidence: countryRuleReadiness.minimumConfidence,
    countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
    reviewRequiredReasonCodes: [],
    prerequisiteStatusCodes: [],
    prerequisiteReferences: [],
    evidenceReferences: [],
    requiredDisclaimers: INVALIDITY_REVIEW_REQUIRED_DISCLAIMERS,
    privacyAlignment: INVALIDITY_REVIEW_PRIVACY_ALIGNMENT,
    piiClassification: 'medical_sensitive',
  };
}

function invalidityOutputFailure(
  params: {
    reviewRequiredReasonCodes: readonly string[];
    prerequisiteStatusCodes: readonly string[];
    applicableRules: readonly InvalidityReviewRuleInput[];
    countryRuleMetadata: readonly CountryRuleMetadata[];
  },
  closed: CloseInvalidityReadiness
): InvalidityReviewReadiness | null {
  if (
    params.reviewRequiredReasonCodes.length === 0 ||
    params.reviewRequiredReasonCodes.some(code => !isInvalidityReviewReasonCode(code))
  ) {
    return closed(
      'unsupported_review_reason',
      'manual_review_required',
      params.countryRuleMetadata
    );
  }

  if (
    params.prerequisiteStatusCodes.length === 0 ||
    params.prerequisiteStatusCodes.some(code => !isInvalidityPrerequisiteStatusCode(code))
  ) {
    return closed(
      'unsupported_prerequisite_code',
      'manual_review_required',
      params.countryRuleMetadata
    );
  }

  if (params.applicableRules.some(rule => hasUnsupportedEvidenceType(rule))) {
    return closed(
      'unsupported_evidence_type',
      'manual_review_required',
      params.countryRuleMetadata
    );
  }

  return null;
}

export function createInvalidityReviewPack(
  input: CreateInvalidityReviewPackInput
): InvalidityCoefficientReviewPack {
  const readiness = evaluateInvalidityReview({
    ...input,
    aiAssistedEvidenceUsed:
      input.aiAssistedEvidenceUsed ?? input.provenance?.source === 'ai_assisted',
    zone: 'member',
  });
  const outcome = createInvalidityReviewOutcome(input, readiness);

  return {
    packType: 'invalidity_review',
    packId: input.packId,
    zone: 'member',
    outcome,
    reviewRequiredReasonCodes: readiness.reviewRequiredReasonCodes,
    prerequisiteStatusCodes: readiness.prerequisiteStatusCodes,
    prerequisiteReferences: readiness.prerequisiteReferences,
    evidenceReferences: readiness.evidenceReferences,
    privacyAlignment: readiness.privacyAlignment,
    documentSensitivityClass: readiness.documentSensitivityClass,
    inputsSummary: invalidityInputsSummary(readiness),
    requiredHumanReview: true,
    requiredDisclaimers: readiness.requiredDisclaimers,
    piiClassification: 'medical_sensitive',
    countryRuleMetadata: readiness.countryRuleMetadata,
    provenance: input.provenance ?? DEFAULT_ASSISTANCE_PROVENANCE,
    retentionPolicyKey: INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.retentionPolicyKey,
  };
}

function invalidityInputsSummary(
  readiness: InvalidityReviewReadiness
): InvalidityCoefficientReviewPack['inputsSummary'] {
  const countryCode =
    readiness.applicableJurisdictionCountry.length > 0
      ? `country:${readiness.applicableJurisdictionCountry}`
      : 'country:unknown';

  return [
    { code: countryCode },
    { code: `incident_country:${readiness.incidentCountry || 'unknown'}` },
    { code: `member_residence_country:${readiness.memberResidenceCountry || 'unknown'}` },
    { code: `treatment_country:${readiness.treatmentCountry || 'unknown'}` },
    { code: `vehicle_registration_country:${readiness.vehicleRegistrationCountry || 'unknown'}` },
    { code: `insurer_country:${readiness.insurerCountry || 'unknown'}` },
    { code: `invalidity_scenario:${readiness.scenario}` },
    { code: `invalidity_role:${readiness.participantRole}` },
    { code: `invalidity_rule_family:${readiness.requestedRuleFamily}` },
  ];
}

function invalidityReadiness(params: {
  kind: Exclude<InvalidityReviewReadinessKind, 'ready'>;
  outcomeKind: AssistanceOutcomeKind;
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  applicableJurisdictionCountry: string;
  incidentCountry: string;
  memberResidenceCountry: string;
  treatmentCountry: string;
  vehicleRegistrationCountry: string;
  insurerCountry: string;
  jurisdictionTieBreakerReason?: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  documentSensitivityClass: InvalidityDocumentSensitivityClass;
}): InvalidityReviewReadiness {
  return {
    kind: params.kind,
    ready: false,
    outcomeKind: params.outcomeKind,
    humanReviewRequired: true,
    reasons: [
      {
        code: `invalidity_review_${params.kind}`,
        messageKey: `assistance.invalidity.${params.kind}`,
      },
    ],
    minimumConfidence: params.minimumConfidence,
    countryRuleMetadata: params.countryRuleMetadata,
    applicableJurisdictionCountry: params.applicableJurisdictionCountry,
    incidentCountry: params.incidentCountry,
    memberResidenceCountry: params.memberResidenceCountry,
    treatmentCountry: params.treatmentCountry,
    vehicleRegistrationCountry: params.vehicleRegistrationCountry,
    insurerCountry: params.insurerCountry,
    jurisdictionTieBreakerReason: params.jurisdictionTieBreakerReason,
    scenario: params.scenario,
    participantRole: params.participantRole,
    requestedRuleFamily: params.requestedRuleFamily,
    reviewRequiredReasonCodes: [],
    prerequisiteStatusCodes: [],
    prerequisiteReferences: [],
    evidenceReferences: [],
    requiredDisclaimers: INVALIDITY_REVIEW_REQUIRED_DISCLAIMERS,
    privacyAlignment: INVALIDITY_REVIEW_PRIVACY_ALIGNMENT,
    documentSensitivityClass: params.documentSensitivityClass,
    piiClassification: 'medical_sensitive',
  };
}

function invalidityReadinessContext(
  input: InvalidityReviewReadinessInput,
  params: {
    minimumConfidence: number;
    applicableJurisdictionCountry: string;
    incidentCountry: string;
    memberResidenceCountry: string;
    treatmentCountry: string;
    vehicleRegistrationCountry: string;
    insurerCountry: string;
    countryRuleMetadata: readonly CountryRuleMetadata[];
    documentSensitivityClass: InvalidityDocumentSensitivityClass;
  }
) {
  return {
    requestedRuleFamily: input.requestedRuleFamily,
    participantRole: input.participantRole,
    scenario: input.scenario,
    applicableJurisdictionCountry: params.applicableJurisdictionCountry,
    incidentCountry: params.incidentCountry,
    memberResidenceCountry: params.memberResidenceCountry,
    treatmentCountry: params.treatmentCountry,
    vehicleRegistrationCountry: params.vehicleRegistrationCountry,
    insurerCountry: params.insurerCountry,
    jurisdictionTieBreakerReason: input.jurisdictionTieBreakerReason,
    countryRuleMetadata: params.countryRuleMetadata,
    minimumConfidence: params.minimumConfidence,
    documentSensitivityClass: params.documentSensitivityClass,
  };
}

function jurisdictionTieBreakerRequired(countries: {
  applicableJurisdictionCountry: string;
  incidentCountry: string;
  memberResidenceCountry: string;
  treatmentCountry: string;
  vehicleRegistrationCountry: string;
  insurerCountry: string;
}): boolean {
  const comparedCountries = [
    countries.incidentCountry,
    countries.memberResidenceCountry,
    countries.treatmentCountry,
    countries.vehicleRegistrationCountry,
    countries.insurerCountry,
  ].filter(country => country.length > 0);

  return comparedCountries.some(country => country !== countries.applicableJurisdictionCountry);
}

function invalidityVehicleContextRequired(input: InvalidityReviewReadinessInput): boolean {
  return [
    input.scenario === 'traffic_injury_invalidity',
    input.scenario === 'cross_border_traffic_injury_invalidity',
    input.scenario === 'green_card_vehicle_invalidity',
    input.vehicleDamageEvidenceIncluded,
    input.vehicleRegistrationEvidenceIncluded,
    input.plateOrVinDerivedEvidenceIncluded,
    input.insurerVehicleCorrespondenceIncluded,
    input.repairEvidenceIncluded,
    input.towingEvidenceIncluded,
    input.bureauEvidenceIncluded,
    input.trafficIncidentEvidenceIncluded,
    isFilled(input.vehicleRegistrationCountry),
    isFilled(input.insurerCountry),
  ].some(Boolean);
}

function invalidityDocumentProcessingConsentRequired(
  input: InvalidityReviewReadinessInput
): boolean {
  return input.documentEvidenceIncluded === true || invalidityVehicleContextRequired(input);
}

function invalidityConflictingSourceReferences(params: {
  explicitReferences?: readonly string[];
  applicableRules: readonly InvalidityReviewRuleInput[];
  applicableJurisdictionCountry: string;
}): readonly string[] {
  const sourceReferences = [
    ...(params.explicitReferences ?? []),
    ...findContradictingSourceReferences(params.applicableRules),
  ];

  const hasCountryMismatch = params.applicableRules.some(rule => {
    return normalizeCountry(rule.metadata?.country) !== params.applicableJurisdictionCountry;
  });

  if (hasCountryMismatch) {
    sourceReferences.push('invalidity-review/metadata-country-mismatch');
  }

  return sourceReferences;
}

function createInvalidityReviewOutcome(
  input: CreateInvalidityReviewPackInput,
  readiness: InvalidityReviewReadiness
): AssistanceOutcome & { zone: 'member' } {
  const boundaryOutcome = createInvalidityReviewBoundaryOutcome({
    createdAt: input.createdAt,
    evidence: [...(input.evidence ?? []), ...readiness.evidenceReferences],
    provenance: input.provenance,
    reasons: readiness.reasons,
    zone: 'member',
  });

  return createAssistanceOutcome({
    createdAt: input.createdAt,
    piiClassification: 'medical_sensitive',
    provenance: input.provenance,
    disclaimers: readiness.requiredDisclaimers,
    humanReviewRequired: true,
    countryRuleMetadata: readiness.countryRuleMetadata,
    evidence: boundaryOutcome.evidence,
    reasons: boundaryOutcome.reasons,
    zone: 'member',
    kind: readiness.outcomeKind,
  }) as AssistanceOutcome & { zone: 'member' };
}

function isApplicableRule(
  rule: InvalidityReviewRuleInput,
  input: InvalidityReviewReadinessInput,
  applicableJurisdictionCountry: string
): boolean {
  return [
    normalizeCountry(rule.country) === applicableJurisdictionCountry,
    rule.scenario === input.scenario,
    rule.participantRole === input.participantRole,
    rule.ruleFamily === input.requestedRuleFamily,
  ].every(Boolean);
}

function uniqueEvidenceReferences(
  references: readonly InvalidityReviewEvidenceReferenceInput[],
  fallbackSensitivity: InvalidityDocumentSensitivityClass
): readonly InvalidityReviewEvidenceReference[] {
  const seen = new Set<string>();
  const output: InvalidityReviewEvidenceReference[] = [];

  for (const reference of references) {
    if (!isCompleteEvidenceReference(reference)) {
      continue;
    }

    const key = `${reference.kind}:${reference.referenceId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push({
      kind: reference.kind,
      referenceId: reference.referenceId,
      summaryKey: reference.summaryKey,
      sourceReference: reference.sourceReference,
      lastReviewed: reference.lastReviewed,
      confidence: reference.confidence,
      documentSensitivityClass: reference.documentSensitivityClass ?? fallbackSensitivity,
      processingPurpose:
        reference.processingPurpose ?? INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.processingPurpose,
    });
  }

  return output;
}

function invalidityKindFromCountryRule(
  kind: Exclude<ReturnType<typeof evaluateCountryRuleReadiness>['kind'], 'ready'>
): InvalidityReviewReadinessKind {
  if (kind === 'missing') {
    return 'missing_rule';
  }

  return kind;
}

function completeMetadataFromRules(
  rules: readonly InvalidityReviewRuleInput[]
): readonly CountryRuleMetadata[] {
  const metadata: CountryRuleMetadata[] = [];

  for (const rule of rules) {
    if (isCompleteCountryRuleMetadata(rule.metadata)) {
      metadata.push(rule.metadata);
    }
  }

  return metadata;
}

function findContradictingSourceReferences(
  rules: readonly InvalidityReviewRuleInput[]
): readonly string[] {
  const groupedRules = new Map<string, InvalidityReviewRuleInput[]>();

  for (const rule of rules) {
    const subject = `${rule.scenario}:${rule.participantRole}:${rule.ruleFamily}`;
    const nextGroup = groupedRules.get(subject) ?? [];
    nextGroup.push(rule);
    groupedRules.set(subject, nextGroup);
  }

  return [...groupedRules.values()].flatMap(group => {
    const reasonCodeSets = new Set(
      group.map(rule => uniqueNonEmptyStrings(rule.reviewReasonCodes ?? []).join('|'))
    );
    const prerequisiteCodeSets = new Set(
      group.map(rule => uniqueNonEmptyStrings(rule.prerequisiteStatusCodes ?? []).join('|'))
    );

    if (reasonCodeSets.size <= 1 && prerequisiteCodeSets.size <= 1) {
      return [];
    }

    return group.flatMap(rule => {
      return isCompleteCountryRuleMetadata(rule.metadata) ? [rule.metadata.sourceReference] : [];
    });
  });
}

function isOutOfScopeInvalidityAssessment(
  input: InvalidityReviewReadinessInput | InvalidityReviewRuleInput
): boolean {
  return [
    input.requiresMedicalDiagnosis,
    input.requiresPrognosis,
    input.requiresTreatmentAdvice,
    input.requiresInvalidityCoefficientCalculation,
    input.requiresCompensationValuation,
    input.requiresInsurerLiabilityAssessment,
    input.requiresInsurerCoverageDecision,
    input.requiresFraudDetermination,
    input.requiresSettlementStrategy,
    input.requiresLegalAdvice,
  ].some(Boolean);
}

function hasUnsupportedEvidenceType(rule: InvalidityReviewRuleInput): boolean {
  if (rule.evidenceKindsSupported == null) {
    return false;
  }

  return (rule.evidenceReferences ?? []).some(
    reference => !rule.evidenceKindsSupported?.includes(reference.kind)
  );
}

function inferDocumentSensitivityClass(
  rules: readonly InvalidityReviewRuleInput[]
): InvalidityDocumentSensitivityClass {
  if (
    rules.some(
      rule =>
        rule.documentSensitivityClass ===
        INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.legalDocumentSensitivity
    )
  ) {
    return INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.legalDocumentSensitivity;
  }

  if (
    rules.some(
      rule =>
        rule.documentSensitivityClass ===
        INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.ordinaryDocumentSensitivity
    )
  ) {
    return INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.ordinaryDocumentSensitivity;
  }

  return INVALIDITY_REVIEW_PRIVACY_ALIGNMENT.sensitiveHealthDocumentSensitivity;
}

function isCompleteCountryRuleMetadata(
  metadata?: InvalidityReviewCountryRuleMetadataInput | null
): metadata is CountryRuleMetadata {
  if (metadata == null || !COUNTRY_METADATA_TEXT_FIELDS.every(field => isFilled(metadata[field]))) {
    return false;
  }

  return isFiniteConfidence(metadata.confidence);
}

function isCompleteEvidenceReference(
  reference?: InvalidityReviewEvidenceReferenceInput
): reference is InvalidityReviewEvidenceReferenceInput & {
  kind: AssistanceEvidenceKind;
  referenceId: string;
  sourceReference: string;
  lastReviewed: string;
  confidence: number;
} {
  return (
    reference != null &&
    isAssistanceEvidenceKind(reference.kind) &&
    isFilled(reference.referenceId) &&
    isFilled(reference.sourceReference) &&
    isFilled(reference.lastReviewed) &&
    isFiniteConfidence(reference.confidence)
  );
}

function isCompletePrerequisiteReference(reference: InvalidityPrerequisiteReferenceInput): boolean {
  return (
    isFilled(reference.packId) &&
    isFilled(reference.sourceReference) &&
    isFilled(reference.lastReviewed) &&
    isFiniteConfidence(reference.confidence)
  );
}

function isAssistanceEvidenceKind(value: unknown): value is AssistanceEvidenceKind {
  return (
    typeof value === 'string' && ASSISTANCE_EVIDENCE_KINDS.includes(value as AssistanceEvidenceKind)
  );
}

function isInvalidityReviewRuleFamily(value: string): value is InvalidityReviewRuleFamily {
  return INVALIDITY_REVIEW_RULE_FAMILIES.includes(value as InvalidityReviewRuleFamily);
}

function isInvalidityReviewScenario(value: string): value is InvalidityReviewScenario {
  return INVALIDITY_REVIEW_SCENARIOS.includes(value as InvalidityReviewScenario);
}

function isInvalidityReviewParticipantRole(
  value: string
): value is InvalidityReviewParticipantRole {
  return INVALIDITY_REVIEW_PARTICIPANT_ROLES.includes(value as InvalidityReviewParticipantRole);
}

function isInvalidityReviewReasonCode(value: string): value is InvalidityReviewReasonCode {
  return INVALIDITY_REVIEW_REASON_CODES.includes(value as InvalidityReviewReasonCode);
}

function isInvalidityPrerequisiteStatusCode(
  value: string
): value is InvalidityPrerequisiteStatusCode {
  return INVALIDITY_PREREQUISITE_STATUS_CODES.includes(value as InvalidityPrerequisiteStatusCode);
}

function minimumInvalidityConfidence(value: number | undefined): number {
  return minimumCountryRuleConfidence(value);
}
