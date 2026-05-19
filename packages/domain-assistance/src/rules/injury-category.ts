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
  InjuryCategoryPack,
  PiiClassification,
} from '../types';
import { DEFAULT_ASSISTANCE_PROVENANCE } from './constants';
import { evaluateCountryRuleReadiness } from './country-rules';
import { getRequiredDisclaimerCodes } from './disclaimers';
import { createAssistanceOutcome } from './outcomes';
import {
  isFilled,
  isFiniteConfidence,
  minimumCountryRuleConfidence,
  normalizeCountry,
  normalizeStaleAfterDays,
  uniqueNonEmptyStrings,
} from './rule-utils';

export const INJURY_CATEGORY_RULE_FAMILIES = ['injury_category_precheck'] as const;

export type InjuryCategoryRuleFamily = (typeof INJURY_CATEGORY_RULE_FAMILIES)[number];

export const INJURY_CATEGORY_SCENARIOS = [
  'traffic_collision',
  'cross_border_collision',
  'pedestrian_or_cyclist_collision',
] as const;

export type InjuryCategoryScenario = (typeof INJURY_CATEGORY_SCENARIOS)[number];

export const INJURY_CATEGORY_PARTICIPANT_ROLES = [
  'member_driver',
  'member_passenger',
  'member_pedestrian',
  'member_cyclist',
] as const;

export type InjuryCategoryParticipantRole = (typeof INJURY_CATEGORY_PARTICIPANT_ROLES)[number];

export const INJURY_CATEGORY_CODES = [
  'soft_tissue_reported',
  'fracture_or_dislocation_reported',
  'head_neck_or_spine_reported',
  'psychological_distress_reported',
  'medical_attention_unknown',
  'urgent_medical_review_indicator',
] as const;

export type InjuryCategoryCode = (typeof INJURY_CATEGORY_CODES)[number];

export const INJURY_CATEGORY_SEVERITY_BANDS = [
  'minor_reported',
  'moderate_reported',
  'serious_reported',
  'urgent_review_required',
] as const;

export type InjuryCategorySeverityBand = (typeof INJURY_CATEGORY_SEVERITY_BANDS)[number];

export const INJURY_PRIVACY_ALIGNMENT = {
  processingPurpose: 'injury_category_precheck',
  documentSensitivity: 'sensitive_health',
  medicalDocumentConsentType: 'medical_document_processing',
  aiExtractionConsentType: 'ai_document_extraction',
  article9Basis: 'explicit_consent',
  retentionPolicyKey: 'member_assistance_sensitive_health_v1',
} as const;

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

export type InjuryCategoryReadinessKind =
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
  | 'unsupported_injury_category'
  | 'unsupported_severity_band'
  | 'low_confidence'
  | 'privacy_consent_missing'
  | 'article_9_consent_missing'
  | 'out_of_scope'
  | 'professional_review_required';

export type InjuryCategoryCountryRuleMetadataInput = Partial<CountryRuleMetadata>;

export interface InjuryEvidenceReferenceInput extends AssistanceEvidenceReference {
  kind: AssistanceEvidenceKind;
  referenceId: string;
  sourceReference?: string;
  lastReviewed?: string;
  confidence?: number;
}

export interface InjuryCategoryRuleInput {
  country: string;
  scenario: InjuryCategoryScenario;
  participantRole: InjuryCategoryParticipantRole;
  ruleFamily: InjuryCategoryRuleFamily;
  metadata?: InjuryCategoryCountryRuleMetadataInput | null;
  supportedCountry?: boolean;
  scenarioSupported?: boolean;
  roleSupported?: boolean;
  ruleFamilySupported?: boolean;
  categoryCodes?: readonly string[];
  severityBand?: string;
  evidenceReferences?: readonly InjuryEvidenceReferenceInput[];
  requiresProfessionalRecovery?: boolean;
  requiresProfessionalReview?: boolean;
  requiresMedicalAssessment?: boolean;
  requiresDiagnosis?: boolean;
  requiresPrognosis?: boolean;
  requiresTreatmentAdvice?: boolean;
  requiresInvalidityCoefficient?: boolean;
  requiresCompensationValuation?: boolean;
  requiresInsurerLiabilityAssessment?: boolean;
}

export interface InjuryCategoryReadinessInput {
  zone: AssistanceServiceZone;
  applicableJurisdictionCountry?: string;
  incidentCountry?: string;
  jurisdictionTieBreakerReason?: string;
  scenario: InjuryCategoryScenario | string;
  participantRole: InjuryCategoryParticipantRole | string;
  requestedRuleFamily: InjuryCategoryRuleFamily | string;
  rules: readonly InjuryCategoryRuleInput[];
  now: Date;
  staleAfterDays?: number;
  minimumConfidence?: number;
  conflictingSourceReferences?: readonly string[];
  sensitiveHealthEvidence?: boolean;
  medicalDocumentConsentRecorded?: boolean;
  article9ExplicitConsentRecorded?: boolean;
  requiresMedicalAssessment?: boolean;
  requiresDiagnosis?: boolean;
  requiresPrognosis?: boolean;
  requiresTreatmentAdvice?: boolean;
  requiresInvalidityCoefficient?: boolean;
  requiresCompensationValuation?: boolean;
  requiresInsurerLiabilityAssessment?: boolean;
  requiresProfessionalRecovery?: boolean;
}

export interface InjuryCategoryReadiness {
  kind: InjuryCategoryReadinessKind;
  ready: boolean;
  outcomeKind: AssistanceOutcomeKind;
  humanReviewRequired: boolean;
  reasons: readonly AssistanceReason[];
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  applicableJurisdictionCountry: string;
  incidentCountry: string;
  jurisdictionTieBreakerReason?: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  categoryCodes: readonly InjuryCategoryCode[];
  severityBand?: InjuryCategorySeverityBand;
  evidenceReferences: readonly AssistanceEvidenceReference[];
  requiredDisclaimers: readonly AssistanceDisclaimerCode[];
  privacyAlignment: typeof INJURY_PRIVACY_ALIGNMENT;
}

export interface InjuryCategoryPrecheckPack extends InjuryCategoryPack {
  categoryCodes: readonly InjuryCategoryCode[];
  severityBand?: InjuryCategorySeverityBand;
  evidenceReferences: readonly AssistanceEvidenceReference[];
  privacyAlignment: typeof INJURY_PRIVACY_ALIGNMENT;
}

export interface CreateInjuryCategoryPackInput extends Omit<InjuryCategoryReadinessInput, 'zone'> {
  packId: string;
  createdAt: string;
  evidence?: readonly AssistanceEvidenceReference[];
  provenance?: AssistanceProvenance;
  piiClassification?: PiiClassification;
}

export function evaluateInjuryCategoryPrecheck(
  input: InjuryCategoryReadinessInput
): InjuryCategoryReadiness {
  const minimumConfidence = minimumInjuryConfidence(input.minimumConfidence);
  const applicableJurisdictionCountry = normalizeCountry(input.applicableJurisdictionCountry);
  const incidentCountry = normalizeCountry(input.incidentCountry) || applicableJurisdictionCountry;
  const metadata = completeMetadataFromRules(input.rules);
  const base = injuryReadinessContext(input, {
    minimumConfidence,
    applicableJurisdictionCountry,
    incidentCountry,
    countryRuleMetadata: metadata,
  });
  const closed = (
    kind: Exclude<InjuryCategoryReadinessKind, 'ready'>,
    outcomeKind: AssistanceOutcomeKind,
    countryRuleMetadata: readonly CountryRuleMetadata[] = base.countryRuleMetadata
  ) => {
    return injuryReadiness({
      ...base,
      countryRuleMetadata,
      kind,
      outcomeKind,
    });
  };

  if (input.zone === 'professional_recovery' || input.requiresProfessionalRecovery === true) {
    return closed('requires_professional_recovery', 'requires_professional_recovery');
  }

  if (input.zone !== 'member') {
    return closed('requires_member_zone', 'requires_member_zone');
  }

  if (applicableJurisdictionCountry.length === 0) {
    return closed('missing_jurisdiction', 'manual_review_required');
  }

  if (
    incidentCountry.length > 0 &&
    incidentCountry !== applicableJurisdictionCountry &&
    !isFilled(input.jurisdictionTieBreakerReason)
  ) {
    return closed('jurisdiction_tie_breaker_missing', 'manual_review_required');
  }

  if (!isInjuryCategoryRuleFamily(input.requestedRuleFamily)) {
    return closed('unsupported_rule_family', 'uncertain');
  }

  if (!isInjuryCategoryScenario(input.scenario)) {
    return closed('unsupported_scenario', 'uncertain');
  }

  if (!isInjuryCategoryParticipantRole(input.participantRole)) {
    return closed('unsupported_role', 'uncertain');
  }

  if (isOutOfScopeMedicalAssessment(input)) {
    return closed('out_of_scope', 'out_of_scope');
  }

  if (input.sensitiveHealthEvidence === true && input.medicalDocumentConsentRecorded !== true) {
    return closed('privacy_consent_missing', 'manual_review_required');
  }

  if (input.sensitiveHealthEvidence === true && input.article9ExplicitConsentRecorded !== true) {
    return closed('article_9_consent_missing', 'manual_review_required');
  }

  const applicableRules = input.rules.filter(rule =>
    isApplicableRule(rule, input, applicableJurisdictionCountry)
  );
  const relevantRules = input.rules.filter(rule => isRelevantInjuryRule(rule, input));

  if (applicableRules.length === 0) {
    return closed('missing_rule', 'manual_review_required');
  }

  if (applicableRules.some(rule => !isCompleteCountryRuleMetadata(rule.metadata))) {
    return closed('metadata_incomplete', 'manual_review_required');
  }

  const applicableMetadata = applicableRules.map(rule => rule.metadata as CountryRuleMetadata);
  const conflictingSourceReferences = injuryConflictingSourceReferences({
    explicitReferences: input.conflictingSourceReferences,
    relevantRules,
    applicableRules,
    applicableJurisdictionCountry,
  });

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

  if (applicableRules.some(isOutOfScopeMedicalAssessment)) {
    return closed('out_of_scope', 'out_of_scope', applicableMetadata);
  }

  if (applicableRules.some(rule => rule.requiresProfessionalReview === true)) {
    return closed('professional_review_required', 'manual_review_required', applicableMetadata);
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
    return {
      ...base,
      kind: injuryKindFromCountryRule(countryRuleReadiness.kind),
      ready: false,
      outcomeKind: countryRuleReadiness.outcomeKind,
      humanReviewRequired: true,
      reasons: countryRuleReadiness.reasons,
      minimumConfidence: countryRuleReadiness.minimumConfidence,
      countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
      categoryCodes: [],
      evidenceReferences: [],
      requiredDisclaimers: getRequiredDisclaimerCodes('member'),
      privacyAlignment: INJURY_PRIVACY_ALIGNMENT,
    };
  }

  const categoryCodes = uniqueNonEmptyStrings(
    applicableRules.flatMap(rule => rule.categoryCodes ?? [])
  );

  if (categoryCodes.length === 0 || categoryCodes.some(code => !isInjuryCategoryCode(code))) {
    return closed(
      'unsupported_injury_category',
      'manual_review_required',
      countryRuleReadiness.countryRuleMetadata
    );
  }

  const severityBands = uniqueNonEmptyStrings(
    applicableRules.flatMap(rule => (rule.severityBand == null ? [] : [rule.severityBand]))
  );

  if (
    severityBands.length !== 1 ||
    severityBands.some(severityBand => !isInjuryCategorySeverityBand(severityBand))
  ) {
    return closed(
      'unsupported_severity_band',
      'manual_review_required',
      countryRuleReadiness.countryRuleMetadata
    );
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
        code: 'injury_category_precheck_supported',
        messageKey: 'assistance.injuryCategory.supported',
      },
    ],
    minimumConfidence: countryRuleReadiness.minimumConfidence,
    countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
    categoryCodes: categoryCodes as readonly InjuryCategoryCode[],
    severityBand: severityBands[0] as InjuryCategorySeverityBand,
    evidenceReferences,
    requiredDisclaimers: getRequiredDisclaimerCodes('member'),
    privacyAlignment: INJURY_PRIVACY_ALIGNMENT,
  };
}

export function createInjuryCategoryPack(
  input: CreateInjuryCategoryPackInput
): InjuryCategoryPrecheckPack {
  const readiness = evaluateInjuryCategoryPrecheck({
    ...input,
    zone: 'member',
  });
  const outcome = createInjuryCategoryOutcome(input, readiness);

  return {
    packType: 'injury_category',
    packId: input.packId,
    zone: 'member',
    outcome,
    categoryCodes: readiness.categoryCodes,
    severityBand: readiness.severityBand,
    evidenceReferences: readiness.evidenceReferences,
    privacyAlignment: readiness.privacyAlignment,
    inputsSummary: injuryInputsSummary(readiness),
    requiredHumanReview: readiness.humanReviewRequired || outcome.humanReviewRequired,
    requiredDisclaimers: readiness.requiredDisclaimers,
    piiClassification: input.piiClassification ?? 'medical_sensitive',
    countryRuleMetadata: readiness.countryRuleMetadata,
    provenance: input.provenance ?? DEFAULT_ASSISTANCE_PROVENANCE,
    retentionPolicyKey: INJURY_PRIVACY_ALIGNMENT.retentionPolicyKey,
  };
}

function injuryInputsSummary(
  readiness: InjuryCategoryReadiness
): InjuryCategoryPrecheckPack['inputsSummary'] {
  const countryCode =
    readiness.applicableJurisdictionCountry.length > 0
      ? `country:${readiness.applicableJurisdictionCountry}`
      : 'country:unknown';

  return [
    { code: countryCode },
    { code: `incident_country:${readiness.incidentCountry || 'unknown'}` },
    { code: `injury_scenario:${readiness.scenario}` },
    { code: `injury_role:${readiness.participantRole}` },
    { code: `injury_rule_family:${readiness.requestedRuleFamily}` },
  ];
}

function injuryReadiness(params: {
  kind: Exclude<InjuryCategoryReadinessKind, 'ready'>;
  outcomeKind: AssistanceOutcomeKind;
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  applicableJurisdictionCountry: string;
  incidentCountry: string;
  jurisdictionTieBreakerReason?: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
}): InjuryCategoryReadiness {
  return {
    kind: params.kind,
    ready: false,
    outcomeKind: params.outcomeKind,
    humanReviewRequired: true,
    reasons: [
      {
        code: `injury_category_${params.kind}`,
        messageKey: `assistance.injuryCategory.${params.kind}`,
      },
    ],
    minimumConfidence: params.minimumConfidence,
    countryRuleMetadata: params.countryRuleMetadata,
    applicableJurisdictionCountry: params.applicableJurisdictionCountry,
    incidentCountry: params.incidentCountry,
    jurisdictionTieBreakerReason: params.jurisdictionTieBreakerReason,
    scenario: params.scenario,
    participantRole: params.participantRole,
    requestedRuleFamily: params.requestedRuleFamily,
    categoryCodes: [],
    evidenceReferences: [],
    requiredDisclaimers: getRequiredDisclaimerCodes('member'),
    privacyAlignment: INJURY_PRIVACY_ALIGNMENT,
  };
}

function injuryReadinessContext(
  input: InjuryCategoryReadinessInput,
  params: {
    minimumConfidence: number;
    applicableJurisdictionCountry: string;
    incidentCountry: string;
    countryRuleMetadata: readonly CountryRuleMetadata[];
  }
) {
  return {
    requestedRuleFamily: input.requestedRuleFamily,
    participantRole: input.participantRole,
    scenario: input.scenario,
    applicableJurisdictionCountry: params.applicableJurisdictionCountry,
    incidentCountry: params.incidentCountry,
    jurisdictionTieBreakerReason: input.jurisdictionTieBreakerReason,
    countryRuleMetadata: params.countryRuleMetadata,
    minimumConfidence: params.minimumConfidence,
  };
}

function injuryConflictingSourceReferences(params: {
  explicitReferences?: readonly string[];
  relevantRules: readonly InjuryCategoryRuleInput[];
  applicableRules: readonly InjuryCategoryRuleInput[];
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
    sourceReferences.push('injury-category/metadata-country-mismatch');
  }

  return sourceReferences;
}

function createInjuryCategoryOutcome(
  input: CreateInjuryCategoryPackInput,
  readiness: InjuryCategoryReadiness
): AssistanceOutcome & { zone: 'member' } {
  return createAssistanceOutcome({
    createdAt: input.createdAt,
    piiClassification: input.piiClassification ?? 'medical_sensitive',
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

function isRelevantInjuryRule(
  rule: InjuryCategoryRuleInput,
  input: InjuryCategoryReadinessInput
): boolean {
  return (
    rule.scenario === input.scenario &&
    rule.participantRole === input.participantRole &&
    rule.ruleFamily === input.requestedRuleFamily
  );
}

function isApplicableRule(
  rule: InjuryCategoryRuleInput,
  input: InjuryCategoryReadinessInput,
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
  references: readonly InjuryEvidenceReferenceInput[]
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

function injuryKindFromCountryRule(
  kind: Exclude<ReturnType<typeof evaluateCountryRuleReadiness>['kind'], 'ready'>
): InjuryCategoryReadinessKind {
  if (kind === 'missing') {
    return 'missing_rule';
  }

  return kind;
}

function completeMetadataFromRules(
  rules: readonly InjuryCategoryRuleInput[]
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
  rules: readonly InjuryCategoryRuleInput[]
): readonly string[] {
  const groupedRules = new Map<string, InjuryCategoryRuleInput[]>();

  for (const rule of rules) {
    const subject = `${rule.scenario}:${rule.participantRole}:${rule.ruleFamily}`;
    const nextGroup = groupedRules.get(subject) ?? [];
    nextGroup.push(rule);
    groupedRules.set(subject, nextGroup);
  }

  return [...groupedRules.values()].flatMap(group => {
    const categorySets = new Set(
      group.map(rule => uniqueNonEmptyStrings(rule.categoryCodes ?? []).join('|'))
    );
    const severityBands = new Set(group.map(rule => rule.severityBand ?? ''));

    if (categorySets.size <= 1 && severityBands.size <= 1) {
      return [];
    }

    return group.flatMap(rule => {
      return isCompleteCountryRuleMetadata(rule.metadata) ? [rule.metadata.sourceReference] : [];
    });
  });
}

function isOutOfScopeMedicalAssessment(
  input: InjuryCategoryReadinessInput | InjuryCategoryRuleInput
): boolean {
  return [
    input.requiresMedicalAssessment,
    input.requiresDiagnosis,
    input.requiresPrognosis,
    input.requiresTreatmentAdvice,
    input.requiresInvalidityCoefficient,
    input.requiresCompensationValuation,
    input.requiresInsurerLiabilityAssessment,
  ].some(Boolean);
}

function isCompleteCountryRuleMetadata(
  metadata?: InjuryCategoryCountryRuleMetadataInput | null
): metadata is CountryRuleMetadata {
  if (metadata == null || !COUNTRY_METADATA_TEXT_FIELDS.every(field => isFilled(metadata[field]))) {
    return false;
  }

  return isFiniteConfidence(metadata.confidence);
}

function isCompleteEvidenceReference(
  reference?: InjuryEvidenceReferenceInput
): reference is InjuryEvidenceReferenceInput & {
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

function isInjuryCategoryRuleFamily(value: string): value is InjuryCategoryRuleFamily {
  return INJURY_CATEGORY_RULE_FAMILIES.includes(value as InjuryCategoryRuleFamily);
}

function isInjuryCategoryScenario(value: string): value is InjuryCategoryScenario {
  return INJURY_CATEGORY_SCENARIOS.includes(value as InjuryCategoryScenario);
}

function isInjuryCategoryParticipantRole(value: string): value is InjuryCategoryParticipantRole {
  return INJURY_CATEGORY_PARTICIPANT_ROLES.includes(value as InjuryCategoryParticipantRole);
}

function isInjuryCategoryCode(value: string): value is InjuryCategoryCode {
  return INJURY_CATEGORY_CODES.includes(value as InjuryCategoryCode);
}

function isInjuryCategorySeverityBand(value: string): value is InjuryCategorySeverityBand {
  return INJURY_CATEGORY_SEVERITY_BANDS.includes(value as InjuryCategorySeverityBand);
}

function minimumInjuryConfidence(value: number | undefined): number {
  return minimumCountryRuleConfidence(value);
}
