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
  PiiClassification,
  VehicleDamagePack,
} from '../types';
import { DEFAULT_ASSISTANCE_PROVENANCE } from './constants';
import { evaluateCountryRuleReadiness } from './country-rules';
import { createAssistanceOutcome } from './outcomes';
import {
  isFilled,
  isFiniteConfidence,
  minimumCountryRuleConfidence,
  normalizeCountry,
  normalizeStaleAfterDays,
  uniqueNonEmptyStrings,
} from './rule-utils';

export const VEHICLE_DAMAGE_RULE_FAMILIES = ['vehicle_damage_precheck'] as const;

export type VehicleDamageRuleFamily = (typeof VEHICLE_DAMAGE_RULE_FAMILIES)[number];

export const VEHICLE_DAMAGE_SCENARIOS = [
  'traffic_collision_damage',
  'parked_vehicle_damage',
  'cross_border_collision_damage',
  'weather_or_road_damage',
] as const;

export type VehicleDamageScenario = (typeof VEHICLE_DAMAGE_SCENARIOS)[number];

export const VEHICLE_DAMAGE_PARTICIPANT_ROLES = [
  'member_driver',
  'member_owner',
  'member_lessee',
  'member_passenger_owner',
] as const;

export type VehicleDamageParticipantRole = (typeof VEHICLE_DAMAGE_PARTICIPANT_ROLES)[number];

export const VEHICLE_DAMAGE_CATEGORY_CODES = [
  'panel_damage_reported',
  'structural_damage_reported',
  'total_loss_suspected',
  'drivability_compromised',
  'glass_only',
  'mechanical_damage_reported',
] as const;

export type VehicleDamageCategoryCode = (typeof VEHICLE_DAMAGE_CATEGORY_CODES)[number];

export const VEHICLE_INSPECTION_READINESS_MARKERS = [
  'inspection_reference_present',
  'inspection_reference_needed',
  'damage_photo_reference_present',
  'repair_invoice_reference_present',
  'drivability_review_required',
] as const;

export type VehicleInspectionReadinessMarker =
  (typeof VEHICLE_INSPECTION_READINESS_MARKERS)[number];

export const VEHICLE_REPAIR_ASSESSMENT_ROUTING_MARKERS = [
  'repair_assessment_review',
  'insurer_review_required',
  'bureau_reference_review',
  'professional_review_required',
] as const;

export type VehicleRepairAssessmentRoutingMarker =
  (typeof VEHICLE_REPAIR_ASSESSMENT_ROUTING_MARKERS)[number];

export const VEHICLE_DAMAGE_PRIVACY_ALIGNMENT = {
  processingPurpose: 'vehicle_damage_precheck',
  documentProcessingConsentType: 'document_upload_processing',
  aiExtractionConsentType: 'ai_document_extraction',
  insurerSharingConsentType: 'share_with_insurer',
  bureauSharingConsentType: 'share_with_bureau',
  ordinaryDocumentSensitivity: 'personal',
  legalDocumentSensitivity: 'legal_professional_recovery',
  retentionPolicyKey: 'member_assistance_vehicle_damage_v1',
} as const;

export const VEHICLE_DAMAGE_REQUIRED_DISCLAIMERS = [
  'not_legal_advice',
  'not_insurer_assessment',
  'not_repair_estimate',
  'not_diminished_value_valuation',
  'not_liability_assessment',
  'not_insurer_coverage_decision',
  'not_fraud_determination',
  'professional_review_required',
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

export type VehicleDamageReadinessKind =
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
  | 'unsupported_damage_category'
  | 'unsupported_inspection_marker'
  | 'unsupported_routing_marker'
  | 'unsupported_evidence_type'
  | 'low_confidence'
  | 'document_processing_consent_missing'
  | 'insurer_sharing_consent_missing'
  | 'bureau_sharing_consent_missing'
  | 'ai_extraction_consent_missing'
  | 'health_evidence_requires_injury_review'
  | 'plate_or_vin_ocr_blocked'
  | 'out_of_scope'
  | 'professional_review_required';

export type VehicleDamageCountryRuleMetadataInput = Partial<CountryRuleMetadata>;

export type VehicleDocumentSensitivityClass =
  | typeof VEHICLE_DAMAGE_PRIVACY_ALIGNMENT.ordinaryDocumentSensitivity
  | typeof VEHICLE_DAMAGE_PRIVACY_ALIGNMENT.legalDocumentSensitivity;

export interface VehicleDamageEvidenceReferenceInput extends AssistanceEvidenceReference {
  kind: AssistanceEvidenceKind;
  referenceId: string;
  sourceReference?: string;
  lastReviewed?: string;
  confidence?: number;
}

export interface VehicleDamageRuleInput {
  country: string;
  scenario: VehicleDamageScenario;
  participantRole: VehicleDamageParticipantRole;
  ruleFamily: VehicleDamageRuleFamily;
  metadata?: VehicleDamageCountryRuleMetadataInput | null;
  supportedCountry?: boolean;
  scenarioSupported?: boolean;
  roleSupported?: boolean;
  ruleFamilySupported?: boolean;
  damageCategoryCodes?: readonly string[];
  inspectionReadinessMarkers?: readonly string[];
  repairAssessmentRoutingMarkers?: readonly string[];
  evidenceReferences?: readonly VehicleDamageEvidenceReferenceInput[];
  evidenceKindsSupported?: readonly AssistanceEvidenceKind[];
  documentSensitivityClass?: VehicleDocumentSensitivityClass;
  requiresProfessionalRecovery?: boolean;
  requiresProfessionalReview?: boolean;
  requiresRepairCostValuation?: boolean;
  requiresDiminishedValueValuation?: boolean;
  requiresLiabilityAssessment?: boolean;
  requiresInsurerCoverageDecision?: boolean;
  requiresFraudDetermination?: boolean;
  requiresSettlementStrategy?: boolean;
  requiresLegalAdvice?: boolean;
  requiresPlateOcr?: boolean;
  requiresVinOcr?: boolean;
  healthEvidenceDetected?: boolean;
}

export interface VehicleDamageReadinessInput {
  zone: AssistanceServiceZone;
  applicableJurisdictionCountry?: string;
  incidentCountry?: string;
  vehicleRegistrationCountry?: string;
  insurerCountry?: string;
  driverResidenceCountry?: string;
  jurisdictionTieBreakerReason?: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  rules: readonly VehicleDamageRuleInput[];
  now: Date;
  staleAfterDays?: number;
  minimumConfidence?: number;
  conflictingSourceReferences?: readonly string[];
  documentProcessingConsentRecorded?: boolean;
  insurerSharingRequested?: boolean;
  insurerSharingConsentRecorded?: boolean;
  bureauSharingRequested?: boolean;
  bureauSharingConsentRecorded?: boolean;
  aiExtractionRequested?: boolean;
  aiExtractionConsentRecorded?: boolean;
  healthEvidenceDetected?: boolean;
  requiresProfessionalRecovery?: boolean;
  requiresRepairCostValuation?: boolean;
  requiresDiminishedValueValuation?: boolean;
  requiresLiabilityAssessment?: boolean;
  requiresInsurerCoverageDecision?: boolean;
  requiresFraudDetermination?: boolean;
  requiresSettlementStrategy?: boolean;
  requiresLegalAdvice?: boolean;
  requiresPlateOcr?: boolean;
  requiresVinOcr?: boolean;
}

export interface VehicleDamageReadiness {
  kind: VehicleDamageReadinessKind;
  ready: boolean;
  outcomeKind: AssistanceOutcomeKind;
  humanReviewRequired: boolean;
  reasons: readonly AssistanceReason[];
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  applicableJurisdictionCountry: string;
  incidentCountry: string;
  vehicleRegistrationCountry: string;
  insurerCountry: string;
  driverResidenceCountry: string;
  jurisdictionTieBreakerReason?: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  damageCategoryCodes: readonly VehicleDamageCategoryCode[];
  inspectionReadinessMarkers: readonly VehicleInspectionReadinessMarker[];
  repairAssessmentRoutingMarkers: readonly VehicleRepairAssessmentRoutingMarker[];
  evidenceReferences: readonly AssistanceEvidenceReference[];
  requiredDisclaimers: readonly AssistanceDisclaimerCode[];
  privacyAlignment: typeof VEHICLE_DAMAGE_PRIVACY_ALIGNMENT;
  documentSensitivityClass: VehicleDocumentSensitivityClass;
  piiClassification: Extract<PiiClassification, 'incident_sensitive'>;
}

export interface VehicleDamagePrecheckPack extends VehicleDamagePack {
  damageCategoryCodes: readonly VehicleDamageCategoryCode[];
  inspectionReadinessMarkers: readonly VehicleInspectionReadinessMarker[];
  repairAssessmentRoutingMarkers: readonly VehicleRepairAssessmentRoutingMarker[];
  evidenceReferences: readonly AssistanceEvidenceReference[];
  privacyAlignment: typeof VEHICLE_DAMAGE_PRIVACY_ALIGNMENT;
  documentSensitivityClass: VehicleDocumentSensitivityClass;
}

export interface CreateVehicleDamagePackInput extends Omit<VehicleDamageReadinessInput, 'zone'> {
  packId: string;
  createdAt: string;
  evidence?: readonly AssistanceEvidenceReference[];
  provenance?: AssistanceProvenance;
}

type CloseVehicleReadiness = (
  kind: Exclude<VehicleDamageReadinessKind, 'ready'>,
  outcomeKind: AssistanceOutcomeKind,
  countryRuleMetadata?: readonly CountryRuleMetadata[]
) => VehicleDamageReadiness;

export function evaluateVehicleDamagePrecheck(
  input: VehicleDamageReadinessInput
): VehicleDamageReadiness {
  const minimumConfidence = minimumVehicleDamageConfidence(input.minimumConfidence);
  const applicableJurisdictionCountry = normalizeCountry(input.applicableJurisdictionCountry);
  const incidentCountry = normalizeCountry(input.incidentCountry) || applicableJurisdictionCountry;
  const vehicleRegistrationCountry = normalizeCountry(input.vehicleRegistrationCountry);
  const insurerCountry = normalizeCountry(input.insurerCountry);
  const driverResidenceCountry = normalizeCountry(input.driverResidenceCountry);
  const metadata = completeMetadataFromRules(input.rules);
  const base = vehicleReadinessContext(input, {
    minimumConfidence,
    applicableJurisdictionCountry,
    incidentCountry,
    vehicleRegistrationCountry,
    insurerCountry,
    driverResidenceCountry,
    countryRuleMetadata: metadata,
    documentSensitivityClass: inferDocumentSensitivityClass(input.rules),
  });
  const closed = (
    kind: Exclude<VehicleDamageReadinessKind, 'ready'>,
    outcomeKind: AssistanceOutcomeKind,
    countryRuleMetadata: readonly CountryRuleMetadata[] = base.countryRuleMetadata
  ) => {
    return vehicleReadiness({
      ...base,
      countryRuleMetadata,
      kind,
      outcomeKind,
    });
  };

  const inputFailure = vehicleInputFailure(input, base, closed);
  if (inputFailure != null) {
    return inputFailure;
  }

  const applicableRules = input.rules.filter(rule =>
    isApplicableRule(rule, input, applicableJurisdictionCountry)
  );
  const relevantRules = input.rules.filter(rule => isRelevantVehicleRule(rule, input));

  const ruleSelectionFailure = vehicleRuleSelectionFailure(applicableRules, closed);
  if (ruleSelectionFailure != null) {
    return ruleSelectionFailure;
  }

  const applicableMetadata = applicableRules.map(rule => rule.metadata as CountryRuleMetadata);
  const conflictingSourceReferences = vehicleConflictingSourceReferences({
    explicitReferences: input.conflictingSourceReferences,
    relevantRules,
    applicableRules,
    applicableJurisdictionCountry,
  });

  const applicableRuleFailure = vehicleApplicableRuleFailure(
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
    return vehicleCountryRuleFailure(base, countryRuleReadiness);
  }

  const damageCategoryCodes = uniqueNonEmptyStrings(
    applicableRules.flatMap(rule => rule.damageCategoryCodes ?? [])
  );

  const inspectionReadinessMarkers = uniqueNonEmptyStrings(
    applicableRules.flatMap(rule => rule.inspectionReadinessMarkers ?? [])
  );

  const repairAssessmentRoutingMarkers = uniqueNonEmptyStrings(
    applicableRules.flatMap(rule => rule.repairAssessmentRoutingMarkers ?? [])
  );

  const outputFailure = vehicleOutputFailure(
    {
      damageCategoryCodes,
      inspectionReadinessMarkers,
      repairAssessmentRoutingMarkers,
      applicableRules,
      countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
    },
    closed
  );
  if (outputFailure != null) {
    return outputFailure;
  }

  const evidenceReferences = uniqueEvidenceReferences(
    applicableRules.flatMap(rule => rule.evidenceReferences ?? [])
  );

  return {
    ...base,
    kind: 'ready',
    ready: true,
    outcomeKind: 'eligible',
    humanReviewRequired: false,
    reasons: [
      {
        code: 'vehicle_damage_precheck_supported',
        messageKey: 'assistance.vehicleDamage.supported',
      },
    ],
    minimumConfidence: countryRuleReadiness.minimumConfidence,
    countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
    damageCategoryCodes: damageCategoryCodes as readonly VehicleDamageCategoryCode[],
    inspectionReadinessMarkers:
      inspectionReadinessMarkers as readonly VehicleInspectionReadinessMarker[],
    repairAssessmentRoutingMarkers:
      repairAssessmentRoutingMarkers as readonly VehicleRepairAssessmentRoutingMarker[],
    evidenceReferences,
    requiredDisclaimers: VEHICLE_DAMAGE_REQUIRED_DISCLAIMERS,
    privacyAlignment: VEHICLE_DAMAGE_PRIVACY_ALIGNMENT,
    piiClassification: 'incident_sensitive',
  };
}

function vehicleInputFailure(
  input: VehicleDamageReadinessInput,
  base: Pick<
    VehicleDamageReadiness,
    | 'applicableJurisdictionCountry'
    | 'incidentCountry'
    | 'vehicleRegistrationCountry'
    | 'insurerCountry'
  >,
  closed: CloseVehicleReadiness
): VehicleDamageReadiness | null {
  if (input.zone === 'professional_recovery' || input.requiresProfessionalRecovery === true) {
    return closed('requires_professional_recovery', 'requires_professional_recovery');
  }

  if (input.zone !== 'member') {
    return closed('requires_member_zone', 'requires_member_zone');
  }

  if (base.applicableJurisdictionCountry.length === 0) {
    return closed('missing_jurisdiction', 'manual_review_required');
  }

  if (
    jurisdictionTieBreakerRequired(input, base) &&
    !isFilled(input.jurisdictionTieBreakerReason)
  ) {
    return closed('jurisdiction_tie_breaker_missing', 'manual_review_required');
  }

  if (!isVehicleDamageRuleFamily(input.requestedRuleFamily)) {
    return closed('unsupported_rule_family', 'uncertain');
  }

  if (!isVehicleDamageScenario(input.scenario)) {
    return closed('unsupported_scenario', 'uncertain');
  }

  if (!isVehicleDamageParticipantRole(input.participantRole)) {
    return closed('unsupported_role', 'uncertain');
  }

  return vehicleConsentOrScopeFailure(input, closed);
}

function vehicleConsentOrScopeFailure(
  input: VehicleDamageReadinessInput,
  closed: CloseVehicleReadiness
): VehicleDamageReadiness | null {
  if (input.healthEvidenceDetected === true) {
    return closed('health_evidence_requires_injury_review', 'manual_review_required');
  }

  if (input.requiresPlateOcr === true || input.requiresVinOcr === true) {
    return closed('plate_or_vin_ocr_blocked', 'manual_review_required');
  }

  if (isOutOfScopeVehicleAssessment(input)) {
    return closed('out_of_scope', 'out_of_scope');
  }

  if (input.documentProcessingConsentRecorded !== true) {
    return closed('document_processing_consent_missing', 'manual_review_required');
  }

  if (input.insurerSharingRequested === true && input.insurerSharingConsentRecorded !== true) {
    return closed('insurer_sharing_consent_missing', 'manual_review_required');
  }

  if (input.bureauSharingRequested === true && input.bureauSharingConsentRecorded !== true) {
    return closed('bureau_sharing_consent_missing', 'manual_review_required');
  }

  if (input.aiExtractionRequested === true && input.aiExtractionConsentRecorded !== true) {
    return closed('ai_extraction_consent_missing', 'manual_review_required');
  }

  return null;
}

function vehicleRuleSelectionFailure(
  applicableRules: readonly VehicleDamageRuleInput[],
  closed: CloseVehicleReadiness
): VehicleDamageReadiness | null {
  if (applicableRules.length === 0) {
    return closed('missing_rule', 'manual_review_required');
  }

  if (applicableRules.some(rule => !isCompleteCountryRuleMetadata(rule.metadata))) {
    return closed('metadata_incomplete', 'manual_review_required');
  }

  return null;
}

function vehicleApplicableRuleFailure(
  applicableRules: readonly VehicleDamageRuleInput[],
  applicableMetadata: readonly CountryRuleMetadata[],
  closed: CloseVehicleReadiness
): VehicleDamageReadiness | null {
  if (applicableRules.some(rule => rule.healthEvidenceDetected === true)) {
    return closed(
      'health_evidence_requires_injury_review',
      'manual_review_required',
      applicableMetadata
    );
  }

  if (
    applicableRules.some(rule => rule.requiresPlateOcr === true || rule.requiresVinOcr === true)
  ) {
    return closed('plate_or_vin_ocr_blocked', 'manual_review_required', applicableMetadata);
  }

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

  if (applicableRules.some(isOutOfScopeVehicleAssessment)) {
    return closed('out_of_scope', 'out_of_scope', applicableMetadata);
  }

  if (applicableRules.some(rule => rule.requiresProfessionalReview === true)) {
    return closed('professional_review_required', 'manual_review_required', applicableMetadata);
  }

  return null;
}

function vehicleCountryRuleFailure(
  base: ReturnType<typeof vehicleReadinessContext>,
  countryRuleReadiness: ReturnType<typeof evaluateCountryRuleReadiness>
): VehicleDamageReadiness {
  return {
    ...base,
    kind: vehicleKindFromCountryRule(
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
    damageCategoryCodes: [],
    inspectionReadinessMarkers: [],
    repairAssessmentRoutingMarkers: [],
    evidenceReferences: [],
    requiredDisclaimers: VEHICLE_DAMAGE_REQUIRED_DISCLAIMERS,
    privacyAlignment: VEHICLE_DAMAGE_PRIVACY_ALIGNMENT,
    piiClassification: 'incident_sensitive',
  };
}

function vehicleOutputFailure(
  params: {
    damageCategoryCodes: readonly string[];
    inspectionReadinessMarkers: readonly string[];
    repairAssessmentRoutingMarkers: readonly string[];
    applicableRules: readonly VehicleDamageRuleInput[];
    countryRuleMetadata: readonly CountryRuleMetadata[];
  },
  closed: CloseVehicleReadiness
): VehicleDamageReadiness | null {
  if (
    params.damageCategoryCodes.length === 0 ||
    params.damageCategoryCodes.some(code => !isVehicleDamageCategoryCode(code))
  ) {
    return closed(
      'unsupported_damage_category',
      'manual_review_required',
      params.countryRuleMetadata
    );
  }

  if (
    params.inspectionReadinessMarkers.length === 0 ||
    params.inspectionReadinessMarkers.some(marker => !isVehicleInspectionReadinessMarker(marker))
  ) {
    return closed(
      'unsupported_inspection_marker',
      'manual_review_required',
      params.countryRuleMetadata
    );
  }

  if (
    params.repairAssessmentRoutingMarkers.length === 0 ||
    params.repairAssessmentRoutingMarkers.some(
      marker => !isVehicleRepairAssessmentRoutingMarker(marker)
    )
  ) {
    return closed(
      'unsupported_routing_marker',
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

export function createVehicleDamagePack(
  input: CreateVehicleDamagePackInput
): VehicleDamagePrecheckPack {
  const readiness = evaluateVehicleDamagePrecheck({
    ...input,
    zone: 'member',
  });
  const outcome = createVehicleDamageOutcome(input, readiness);

  return {
    packType: 'vehicle_damage',
    packId: input.packId,
    zone: 'member',
    outcome,
    damageCategoryCodes: readiness.damageCategoryCodes,
    inspectionReadinessMarkers: readiness.inspectionReadinessMarkers,
    repairAssessmentRoutingMarkers: readiness.repairAssessmentRoutingMarkers,
    evidenceReferences: readiness.evidenceReferences,
    privacyAlignment: readiness.privacyAlignment,
    documentSensitivityClass: readiness.documentSensitivityClass,
    inputsSummary: vehicleInputsSummary(readiness),
    requiredHumanReview: readiness.humanReviewRequired || outcome.humanReviewRequired,
    requiredDisclaimers: readiness.requiredDisclaimers,
    piiClassification: 'incident_sensitive',
    countryRuleMetadata: readiness.countryRuleMetadata,
    provenance: input.provenance ?? DEFAULT_ASSISTANCE_PROVENANCE,
    retentionPolicyKey: VEHICLE_DAMAGE_PRIVACY_ALIGNMENT.retentionPolicyKey,
  };
}

function vehicleInputsSummary(
  readiness: VehicleDamageReadiness
): VehicleDamagePrecheckPack['inputsSummary'] {
  const countryCode =
    readiness.applicableJurisdictionCountry.length > 0
      ? `country:${readiness.applicableJurisdictionCountry}`
      : 'country:unknown';

  return [
    { code: countryCode },
    { code: `incident_country:${readiness.incidentCountry || 'unknown'}` },
    { code: `vehicle_registration_country:${readiness.vehicleRegistrationCountry || 'unknown'}` },
    { code: `insurer_country:${readiness.insurerCountry || 'unknown'}` },
    { code: `driver_residence_country:${readiness.driverResidenceCountry || 'unknown'}` },
    { code: `vehicle_damage_scenario:${readiness.scenario}` },
    { code: `vehicle_damage_role:${readiness.participantRole}` },
    { code: `vehicle_damage_rule_family:${readiness.requestedRuleFamily}` },
  ];
}

function vehicleReadiness(params: {
  kind: Exclude<VehicleDamageReadinessKind, 'ready'>;
  outcomeKind: AssistanceOutcomeKind;
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  applicableJurisdictionCountry: string;
  incidentCountry: string;
  vehicleRegistrationCountry: string;
  insurerCountry: string;
  driverResidenceCountry: string;
  jurisdictionTieBreakerReason?: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  documentSensitivityClass: VehicleDocumentSensitivityClass;
}): VehicleDamageReadiness {
  return {
    kind: params.kind,
    ready: false,
    outcomeKind: params.outcomeKind,
    humanReviewRequired: true,
    reasons: [
      {
        code:
          params.kind === 'health_evidence_requires_injury_review'
            ? 'health_evidence_requires_injury_review'
            : `vehicle_damage_${params.kind}`,
        messageKey:
          params.kind === 'health_evidence_requires_injury_review'
            ? 'assistance.vehicleDamage.healthEvidenceRequiresInjuryReview'
            : `assistance.vehicleDamage.${params.kind}`,
      },
    ],
    minimumConfidence: params.minimumConfidence,
    countryRuleMetadata: params.countryRuleMetadata,
    applicableJurisdictionCountry: params.applicableJurisdictionCountry,
    incidentCountry: params.incidentCountry,
    vehicleRegistrationCountry: params.vehicleRegistrationCountry,
    insurerCountry: params.insurerCountry,
    driverResidenceCountry: params.driverResidenceCountry,
    jurisdictionTieBreakerReason: params.jurisdictionTieBreakerReason,
    scenario: params.scenario,
    participantRole: params.participantRole,
    requestedRuleFamily: params.requestedRuleFamily,
    damageCategoryCodes: [],
    inspectionReadinessMarkers: [],
    repairAssessmentRoutingMarkers: [],
    evidenceReferences: [],
    requiredDisclaimers: VEHICLE_DAMAGE_REQUIRED_DISCLAIMERS,
    privacyAlignment: VEHICLE_DAMAGE_PRIVACY_ALIGNMENT,
    documentSensitivityClass: params.documentSensitivityClass,
    piiClassification: 'incident_sensitive',
  };
}

function vehicleReadinessContext(
  input: VehicleDamageReadinessInput,
  params: {
    minimumConfidence: number;
    applicableJurisdictionCountry: string;
    incidentCountry: string;
    vehicleRegistrationCountry: string;
    insurerCountry: string;
    driverResidenceCountry: string;
    countryRuleMetadata: readonly CountryRuleMetadata[];
    documentSensitivityClass: VehicleDocumentSensitivityClass;
  }
) {
  return {
    requestedRuleFamily: input.requestedRuleFamily,
    participantRole: input.participantRole,
    scenario: input.scenario,
    applicableJurisdictionCountry: params.applicableJurisdictionCountry,
    incidentCountry: params.incidentCountry,
    vehicleRegistrationCountry: params.vehicleRegistrationCountry,
    insurerCountry: params.insurerCountry,
    driverResidenceCountry: params.driverResidenceCountry,
    jurisdictionTieBreakerReason: input.jurisdictionTieBreakerReason,
    countryRuleMetadata: params.countryRuleMetadata,
    minimumConfidence: params.minimumConfidence,
    documentSensitivityClass: params.documentSensitivityClass,
  };
}

function jurisdictionTieBreakerRequired(
  input: VehicleDamageReadinessInput,
  countries: {
    applicableJurisdictionCountry: string;
    incidentCountry: string;
    vehicleRegistrationCountry: string;
    insurerCountry: string;
  }
): boolean {
  const comparedCountries = [
    countries.incidentCountry,
    countries.vehicleRegistrationCountry,
    countries.insurerCountry,
  ].filter(country => country.length > 0);

  if (input.scenario === 'cross_border_collision_damage' && comparedCountries.length > 1) {
    return comparedCountries.some(country => country !== countries.applicableJurisdictionCountry);
  }

  return comparedCountries.some(country => country !== countries.applicableJurisdictionCountry);
}

function vehicleConflictingSourceReferences(params: {
  explicitReferences?: readonly string[];
  relevantRules: readonly VehicleDamageRuleInput[];
  applicableRules: readonly VehicleDamageRuleInput[];
  applicableJurisdictionCountry: string;
}): readonly string[] {
  const sourceReferences = [
    ...(params.explicitReferences ?? []),
    ...findContradictingSourceReferences(params.relevantRules),
  ];

  const hasCountryMismatch = params.applicableRules.some(rule => {
    return normalizeCountry(rule.metadata?.country) !== params.applicableJurisdictionCountry;
  });

  if (hasCountryMismatch) {
    sourceReferences.push('vehicle-damage/metadata-country-mismatch');
  }

  return sourceReferences;
}

function createVehicleDamageOutcome(
  input: CreateVehicleDamagePackInput,
  readiness: VehicleDamageReadiness
): AssistanceOutcome & { zone: 'member' } {
  return createAssistanceOutcome({
    createdAt: input.createdAt,
    piiClassification: 'incident_sensitive',
    provenance: input.provenance,
    disclaimers: readiness.requiredDisclaimers,
    humanReviewRequired: readiness.humanReviewRequired,
    countryRuleMetadata: readiness.countryRuleMetadata,
    evidence: [...(input.evidence ?? []), ...readiness.evidenceReferences],
    reasons: readiness.reasons,
    zone: 'member',
    kind: readiness.outcomeKind,
  }) as AssistanceOutcome & { zone: 'member' };
}

function isRelevantVehicleRule(
  rule: VehicleDamageRuleInput,
  input: VehicleDamageReadinessInput
): boolean {
  return (
    rule.scenario === input.scenario &&
    rule.participantRole === input.participantRole &&
    rule.ruleFamily === input.requestedRuleFamily
  );
}

function isApplicableRule(
  rule: VehicleDamageRuleInput,
  input: VehicleDamageReadinessInput,
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
  references: readonly VehicleDamageEvidenceReferenceInput[]
): readonly AssistanceEvidenceReference[] {
  const seen = new Set<string>();
  const output: AssistanceEvidenceReference[] = [];

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
    });
  }

  return output;
}

function vehicleKindFromCountryRule(
  kind: Exclude<ReturnType<typeof evaluateCountryRuleReadiness>['kind'], 'ready'>
): VehicleDamageReadinessKind {
  if (kind === 'missing') {
    return 'missing_rule';
  }

  return kind;
}

function completeMetadataFromRules(
  rules: readonly VehicleDamageRuleInput[]
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
  rules: readonly VehicleDamageRuleInput[]
): readonly string[] {
  const groupedRules = new Map<string, VehicleDamageRuleInput[]>();

  for (const rule of rules) {
    const subject = `${rule.scenario}:${rule.participantRole}:${rule.ruleFamily}`;
    const nextGroup = groupedRules.get(subject) ?? [];
    nextGroup.push(rule);
    groupedRules.set(subject, nextGroup);
  }

  return [...groupedRules.values()].flatMap(group => {
    const damageCodeSets = new Set(
      group.map(rule => uniqueNonEmptyStrings(rule.damageCategoryCodes ?? []).join('|'))
    );
    const inspectionSets = new Set(
      group.map(rule => uniqueNonEmptyStrings(rule.inspectionReadinessMarkers ?? []).join('|'))
    );
    const routingSets = new Set(
      group.map(rule => uniqueNonEmptyStrings(rule.repairAssessmentRoutingMarkers ?? []).join('|'))
    );

    if (damageCodeSets.size <= 1 && inspectionSets.size <= 1 && routingSets.size <= 1) {
      return [];
    }

    return group.flatMap(rule => {
      return isCompleteCountryRuleMetadata(rule.metadata) ? [rule.metadata.sourceReference] : [];
    });
  });
}

function isOutOfScopeVehicleAssessment(
  input: VehicleDamageReadinessInput | VehicleDamageRuleInput
): boolean {
  return [
    input.requiresRepairCostValuation,
    input.requiresDiminishedValueValuation,
    input.requiresLiabilityAssessment,
    input.requiresInsurerCoverageDecision,
    input.requiresFraudDetermination,
    input.requiresSettlementStrategy,
    input.requiresLegalAdvice,
  ].some(Boolean);
}

function hasUnsupportedEvidenceType(rule: VehicleDamageRuleInput): boolean {
  if (rule.evidenceKindsSupported == null) {
    return false;
  }

  return (rule.evidenceReferences ?? []).some(
    reference => !rule.evidenceKindsSupported?.includes(reference.kind)
  );
}

function inferDocumentSensitivityClass(
  rules: readonly VehicleDamageRuleInput[]
): VehicleDocumentSensitivityClass {
  return rules.some(
    rule =>
      rule.documentSensitivityClass === VEHICLE_DAMAGE_PRIVACY_ALIGNMENT.legalDocumentSensitivity
  )
    ? VEHICLE_DAMAGE_PRIVACY_ALIGNMENT.legalDocumentSensitivity
    : VEHICLE_DAMAGE_PRIVACY_ALIGNMENT.ordinaryDocumentSensitivity;
}

function isCompleteCountryRuleMetadata(
  metadata?: VehicleDamageCountryRuleMetadataInput | null
): metadata is CountryRuleMetadata {
  if (metadata == null || !COUNTRY_METADATA_TEXT_FIELDS.every(field => isFilled(metadata[field]))) {
    return false;
  }

  return isFiniteConfidence(metadata.confidence);
}

function isCompleteEvidenceReference(
  reference?: VehicleDamageEvidenceReferenceInput
): reference is VehicleDamageEvidenceReferenceInput & {
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

function isAssistanceEvidenceKind(value: unknown): value is AssistanceEvidenceKind {
  return (
    typeof value === 'string' && ASSISTANCE_EVIDENCE_KINDS.includes(value as AssistanceEvidenceKind)
  );
}

function isVehicleDamageRuleFamily(value: string): value is VehicleDamageRuleFamily {
  return VEHICLE_DAMAGE_RULE_FAMILIES.includes(value as VehicleDamageRuleFamily);
}

function isVehicleDamageScenario(value: string): value is VehicleDamageScenario {
  return VEHICLE_DAMAGE_SCENARIOS.includes(value as VehicleDamageScenario);
}

function isVehicleDamageParticipantRole(value: string): value is VehicleDamageParticipantRole {
  return VEHICLE_DAMAGE_PARTICIPANT_ROLES.includes(value as VehicleDamageParticipantRole);
}

function isVehicleDamageCategoryCode(value: string): value is VehicleDamageCategoryCode {
  return VEHICLE_DAMAGE_CATEGORY_CODES.includes(value as VehicleDamageCategoryCode);
}

function isVehicleInspectionReadinessMarker(
  value: string
): value is VehicleInspectionReadinessMarker {
  return VEHICLE_INSPECTION_READINESS_MARKERS.includes(value as VehicleInspectionReadinessMarker);
}

function isVehicleRepairAssessmentRoutingMarker(
  value: string
): value is VehicleRepairAssessmentRoutingMarker {
  return VEHICLE_REPAIR_ASSESSMENT_ROUTING_MARKERS.includes(
    value as VehicleRepairAssessmentRoutingMarker
  );
}

function minimumVehicleDamageConfidence(value: number | undefined): number {
  return minimumCountryRuleConfidence(value);
}
