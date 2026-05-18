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
  ProcedurePack,
} from '../types';
import { MINIMUM_COUNTRY_RULE_CONFIDENCE } from '../types';
import { DEFAULT_ASSISTANCE_PROVENANCE, DEFAULT_ASSISTANCE_RETENTION_POLICY } from './constants';
import { evaluateCountryRuleReadiness } from './country-rules';
import { getRequiredDisclaimerCodes } from './disclaimers';
import { createAssistanceOutcome } from './outcomes';

export const PROCEDURE_GUIDE_RULE_FAMILIES = [
  'post_incident_notice',
  'insurer_contact',
  'document_collection',
  'cross_border_next_steps',
] as const;

export type ProcedureGuideRuleFamily = (typeof PROCEDURE_GUIDE_RULE_FAMILIES)[number];

export const PROCEDURE_GUIDE_SCENARIOS = [
  'traffic_collision',
  'cross_border_collision',
  'coverage_dispute',
] as const;

export type ProcedureGuideScenario = (typeof PROCEDURE_GUIDE_SCENARIOS)[number];

export const PROCEDURE_GUIDE_PARTICIPANT_ROLES = [
  'member_driver',
  'member_passenger',
  'member_owner',
  'counterparty_driver',
] as const;

export type ProcedureGuideParticipantRole = (typeof PROCEDURE_GUIDE_PARTICIPANT_ROLES)[number];

export const PROCEDURE_GUIDE_JURISDICTION_ROLES = [
  'incident_country',
  'member_residence_country',
  'counterparty_country',
] as const;

export type ProcedureGuideJurisdictionRole = (typeof PROCEDURE_GUIDE_JURISDICTION_ROLES)[number];

export const PROCEDURE_GUIDE_RULE_CONCLUSIONS = [
  'procedure_guide_supported',
  'procedure_guide_unsupported',
  'professional_review_required',
] as const;

export type ProcedureGuideRuleConclusion = (typeof PROCEDURE_GUIDE_RULE_CONCLUSIONS)[number];

export const PROCEDURE_GUIDE_CODES = [
  'notice_counterparty_insurer',
  'preserve_incident_documents',
  'contact_member_insurer',
  'collect_policy_documents',
  'confirm_green_card_documents',
  'record_damage_evidence',
  'request_professional_review',
  'prepare_member_next_steps',
] as const;

export type ProcedureGuideCode = (typeof PROCEDURE_GUIDE_CODES)[number];

export type ProcedureGuideReadinessKind =
  | 'ready'
  | 'requires_member_zone'
  | 'requires_professional_recovery'
  | 'missing_jurisdiction'
  | 'missing_rule'
  | 'metadata_incomplete'
  | 'stale'
  | 'conflicting'
  | 'unsupported_country'
  | 'unsupported_scenario'
  | 'unsupported_role'
  | 'unsupported_rule_family'
  | 'unsupported_procedure'
  | 'unsupported_procedure_code'
  | 'low_confidence'
  | 'deadline_missing'
  | 'deadline_conflicting'
  | 'deadline_low_confidence'
  | 'deadline_stale'
  | 'deadline_ambiguous'
  | 'out_of_scope'
  | 'professional_review_required';

export type ProcedureGuideCountryRuleMetadataInput = Partial<CountryRuleMetadata>;

export interface ProcedureDeadlineReferenceInput extends AssistanceEvidenceReference {
  sourceReference?: string;
  lastReviewed?: string;
  confidence?: number;
  ambiguous?: boolean;
  stale?: boolean;
  conflictsWith?: readonly string[];
}

export interface ProcedureGuideRuleInput {
  jurisdictionRole: ProcedureGuideJurisdictionRole;
  country: string;
  scenario: ProcedureGuideScenario;
  participantRole: ProcedureGuideParticipantRole;
  ruleFamily: ProcedureGuideRuleFamily;
  metadata?: ProcedureGuideCountryRuleMetadataInput | null;
  supportedCountry?: boolean;
  scenarioSupported?: boolean;
  roleSupported?: boolean;
  ruleFamilySupported?: boolean;
  conclusion?: ProcedureGuideRuleConclusion;
  conclusionSubject?: string;
  procedureCodes?: readonly string[];
  deadlineReferences?: readonly ProcedureDeadlineReferenceInput[];
  deadlineRequired?: boolean;
  requiresLegalInterpretation?: boolean;
  requiresProfessionalRecovery?: boolean;
  requiresProfessionalReview?: boolean;
}

export interface ProcedureGuideReadinessInput {
  zone: AssistanceServiceZone;
  jurisdiction?: string;
  scenario: ProcedureGuideScenario | string;
  participantRole: ProcedureGuideParticipantRole | string;
  requestedRuleFamily: ProcedureGuideRuleFamily | string;
  legalBasisReference?: AssistanceEvidenceReference;
  rules: readonly ProcedureGuideRuleInput[];
  now: Date;
  staleAfterDays?: number;
  deadlineStaleAfterDays?: number;
  minimumConfidence?: number;
  conflictingSourceReferences?: readonly string[];
  conflictingDeadlineReferences?: readonly string[];
  requiresLegalInterpretation?: boolean;
  requiresProfessionalRecovery?: boolean;
}

export interface ProcedureGuideReadiness {
  kind: ProcedureGuideReadinessKind;
  ready: boolean;
  outcomeKind: AssistanceOutcomeKind;
  humanReviewRequired: boolean;
  reasons: readonly AssistanceReason[];
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  jurisdiction: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  legalBasisReference?: AssistanceEvidenceReference;
  procedureCodes: readonly string[];
  deadlineReferences: readonly AssistanceEvidenceReference[];
  requiredDisclaimers: readonly AssistanceDisclaimerCode[];
}

export interface CreateProcedurePackInput extends Omit<ProcedureGuideReadinessInput, 'zone'> {
  packId: string;
  createdAt: string;
  evidence?: readonly AssistanceEvidenceReference[];
  provenance?: AssistanceProvenance;
  piiClassification?: PiiClassification;
}

export function evaluateProcedureGuideReadiness(
  input: ProcedureGuideReadinessInput
): ProcedureGuideReadiness {
  const minimumConfidence = minimumProcedureConfidence(input.minimumConfidence);
  const jurisdiction = normalizeCountry(input.jurisdiction);
  const metadata = completeMetadataFromRules(input.rules);
  const base = {
    minimumConfidence,
    countryRuleMetadata: metadata,
    jurisdiction,
    scenario: input.scenario,
    participantRole: input.participantRole,
    requestedRuleFamily: input.requestedRuleFamily,
    legalBasisReference: input.legalBasisReference,
  };

  if (input.zone === 'professional_recovery' || input.requiresProfessionalRecovery === true) {
    return procedureReadiness({
      ...base,
      kind: 'requires_professional_recovery',
      outcomeKind: 'requires_professional_recovery',
    });
  }

  if (input.zone !== 'member') {
    return procedureReadiness({
      ...base,
      kind: 'requires_member_zone',
      outcomeKind: 'requires_member_zone',
    });
  }

  if (jurisdiction.length === 0) {
    return procedureReadiness({
      ...base,
      kind: 'missing_jurisdiction',
      outcomeKind: 'manual_review_required',
    });
  }

  if (!isProcedureGuideRuleFamily(input.requestedRuleFamily)) {
    return procedureReadiness({
      ...base,
      kind: 'unsupported_rule_family',
      outcomeKind: 'uncertain',
    });
  }

  if (!isProcedureGuideScenario(input.scenario)) {
    return procedureReadiness({
      ...base,
      kind: 'unsupported_scenario',
      outcomeKind: 'uncertain',
    });
  }

  if (!isProcedureGuideParticipantRole(input.participantRole)) {
    return procedureReadiness({
      ...base,
      kind: 'unsupported_role',
      outcomeKind: 'uncertain',
    });
  }

  const applicableRules = input.rules.filter(rule => isApplicableRule(rule, input, jurisdiction));
  const relevantRules = input.rules.filter(rule => isRelevantProcedureRule(rule, input));

  if (applicableRules.length === 0) {
    return procedureReadiness({
      ...base,
      kind: 'missing_rule',
      outcomeKind: 'manual_review_required',
    });
  }

  if (applicableRules.some(rule => !isCompleteCountryRuleMetadata(rule.metadata))) {
    return procedureReadiness({
      ...base,
      kind: 'metadata_incomplete',
      outcomeKind: 'manual_review_required',
    });
  }

  const applicableMetadata = applicableRules.map(rule => rule.metadata as CountryRuleMetadata);
  const metadataCountryMismatch = applicableRules.some(rule => {
    return normalizeCountry(rule.metadata?.country) !== jurisdiction;
  });
  const conflictingSourceReferences = [
    ...(input.conflictingSourceReferences ?? []),
    ...findContradictingSourceReferences(relevantRules),
  ];

  if (metadataCountryMismatch) {
    conflictingSourceReferences.push('procedure-guide/metadata-country-mismatch');
  }

  if (applicableRules.some(rule => rule.requiresProfessionalRecovery === true)) {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'requires_professional_recovery',
      outcomeKind: 'requires_professional_recovery',
    });
  }

  if (applicableRules.some(rule => rule.ruleFamilySupported === false)) {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'unsupported_rule_family',
      outcomeKind: 'uncertain',
    });
  }

  if (applicableRules.some(rule => rule.roleSupported === false)) {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'unsupported_role',
      outcomeKind: 'uncertain',
    });
  }

  if (
    input.requiresLegalInterpretation === true ||
    applicableRules.some(rule => rule.requiresLegalInterpretation === true)
  ) {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'out_of_scope',
      outcomeKind: 'out_of_scope',
    });
  }

  if (
    applicableRules.some(
      rule =>
        rule.requiresProfessionalReview === true ||
        rule.conclusion === 'professional_review_required'
    )
  ) {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'professional_review_required',
      outcomeKind: 'manual_review_required',
    });
  }

  const countryRuleReadiness = evaluateCountryRuleReadiness({
    metadata: applicableMetadata,
    now: input.now,
    staleAfterDays: normalizeStaleAfterDays(input.staleAfterDays),
    minimumConfidence,
    supportedCountry: !applicableRules.some(rule => rule.supportedCountry === false),
    scenarioSupported: !applicableRules.some(rule => rule.scenarioSupported === false),
    conflictingSourceReferences,
  });

  if (countryRuleReadiness.kind !== 'ready') {
    return {
      ...base,
      kind: procedureKindFromCountryRule(countryRuleReadiness.kind),
      ready: false,
      outcomeKind: countryRuleReadiness.outcomeKind,
      humanReviewRequired: true,
      reasons: countryRuleReadiness.reasons,
      minimumConfidence: countryRuleReadiness.minimumConfidence,
      countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
      procedureCodes: [],
      deadlineReferences: [],
      requiredDisclaimers: getRequiredDisclaimerCodes('member'),
    };
  }

  if (applicableRules.some(rule => rule.conclusion !== 'procedure_guide_supported')) {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
      kind: 'unsupported_procedure',
      outcomeKind: 'manual_review_required',
    });
  }

  if (applicableRules.some(rule => uniqueNonEmptyStrings(rule.procedureCodes ?? []).length === 0)) {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
      kind: 'unsupported_procedure',
      outcomeKind: 'manual_review_required',
    });
  }

  const procedureCodes = uniqueNonEmptyStrings(
    applicableRules.flatMap(rule => rule.procedureCodes ?? [])
  );

  if (procedureCodes.some(code => !isProcedureGuideCode(code))) {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
      kind: 'unsupported_procedure_code',
      outcomeKind: 'manual_review_required',
    });
  }

  const deadlineReadiness = evaluateDeadlineReferences(input, applicableRules);

  if (deadlineReadiness.kind !== 'ready') {
    return procedureReadiness({
      ...base,
      countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
      kind: deadlineReadiness.kind,
      outcomeKind: 'manual_review_required',
    });
  }

  return {
    ...base,
    kind: 'ready',
    ready: true,
    outcomeKind: 'eligible',
    humanReviewRequired: false,
    reasons: [
      {
        code: 'procedure_guide_supported',
        messageKey: 'assistance.procedureGuide.supported',
      },
    ],
    minimumConfidence: countryRuleReadiness.minimumConfidence,
    countryRuleMetadata: countryRuleReadiness.countryRuleMetadata,
    procedureCodes,
    deadlineReferences: deadlineReadiness.deadlineReferences,
    requiredDisclaimers: getRequiredDisclaimerCodes('member'),
  };
}

export function createProcedurePack(input: CreateProcedurePackInput): ProcedurePack {
  const readiness = evaluateProcedureGuideReadiness({
    ...input,
    zone: 'member',
  });
  const outcome = createAssistanceOutcome({
    kind: readiness.outcomeKind,
    zone: 'member',
    reasons: readiness.reasons,
    evidence: input.evidence,
    countryRuleMetadata: readiness.countryRuleMetadata,
    humanReviewRequired: readiness.humanReviewRequired,
    disclaimers: readiness.requiredDisclaimers,
    provenance: input.provenance,
    piiClassification: input.piiClassification ?? 'identifier_minimal',
    createdAt: input.createdAt,
  }) as AssistanceOutcome & { zone: 'member' };
  const requiredHumanReview = readiness.humanReviewRequired || outcome.humanReviewRequired;

  return {
    packId: input.packId,
    packType: 'procedure',
    outcome,
    zone: 'member',
    inputsSummary: [
      { code: readiness.jurisdiction ? `country:${readiness.jurisdiction}` : 'country:unknown' },
      { code: `procedure_scenario:${readiness.scenario}` },
      { code: `procedure_role:${readiness.participantRole}` },
      { code: `procedure_rule_family:${readiness.requestedRuleFamily}` },
    ],
    requiredDisclaimers: readiness.requiredDisclaimers,
    requiredHumanReview,
    countryRuleMetadata: readiness.countryRuleMetadata,
    piiClassification: input.piiClassification ?? 'identifier_minimal',
    retentionPolicyKey: DEFAULT_ASSISTANCE_RETENTION_POLICY,
    provenance: input.provenance ?? DEFAULT_ASSISTANCE_PROVENANCE,
    procedureCodes: readiness.procedureCodes,
    deadlineReferences: readiness.deadlineReferences,
    legalBasisReference: readiness.legalBasisReference,
  };
}

function procedureReadiness(params: {
  kind: Exclude<ProcedureGuideReadinessKind, 'ready'>;
  outcomeKind: AssistanceOutcomeKind;
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  jurisdiction: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
  legalBasisReference?: AssistanceEvidenceReference;
}): ProcedureGuideReadiness {
  return {
    kind: params.kind,
    ready: false,
    outcomeKind: params.outcomeKind,
    humanReviewRequired: true,
    reasons: [
      {
        code: `procedure_guide_${params.kind}`,
        messageKey: `assistance.procedureGuide.${params.kind}`,
      },
    ],
    minimumConfidence: params.minimumConfidence,
    countryRuleMetadata: params.countryRuleMetadata,
    jurisdiction: params.jurisdiction,
    scenario: params.scenario,
    participantRole: params.participantRole,
    requestedRuleFamily: params.requestedRuleFamily,
    legalBasisReference: params.legalBasisReference,
    procedureCodes: [],
    deadlineReferences: [],
    requiredDisclaimers: getRequiredDisclaimerCodes('member'),
  };
}

function isRelevantProcedureRule(
  rule: ProcedureGuideRuleInput,
  input: ProcedureGuideReadinessInput
): boolean {
  return (
    rule.scenario === input.scenario &&
    rule.participantRole === input.participantRole &&
    rule.ruleFamily === input.requestedRuleFamily
  );
}

function isApplicableRule(
  rule: ProcedureGuideRuleInput,
  input: ProcedureGuideReadinessInput,
  jurisdiction: string
): boolean {
  return (
    normalizeCountry(rule.country) === jurisdiction &&
    rule.jurisdictionRole === 'incident_country' &&
    rule.scenario === input.scenario &&
    rule.participantRole === input.participantRole &&
    rule.ruleFamily === input.requestedRuleFamily
  );
}

function evaluateDeadlineReferences(
  input: ProcedureGuideReadinessInput,
  applicableRules: readonly ProcedureGuideRuleInput[]
):
  | {
      kind: 'ready';
      deadlineReferences: readonly AssistanceEvidenceReference[];
    }
  | {
      kind: Extract<
        ProcedureGuideReadinessKind,
        | 'deadline_missing'
        | 'deadline_conflicting'
        | 'deadline_low_confidence'
        | 'deadline_stale'
        | 'deadline_ambiguous'
      >;
    } {
  const rulesRequiringDeadlines = applicableRules.filter(rule => rule.deadlineRequired !== false);

  if (
    rulesRequiringDeadlines.some(
      rule => completeDeadlineReferences(rule.deadlineReferences).length === 0
    )
  ) {
    return { kind: 'deadline_missing' };
  }

  const references = applicableRules.flatMap(rule => rule.deadlineReferences ?? []);

  if (references.some(reference => !isCompleteDeadlineReference(reference))) {
    return { kind: 'deadline_missing' };
  }

  if (
    (input.conflictingDeadlineReferences ?? []).length > 0 ||
    references.some(reference => (reference.conflictsWith ?? []).length > 0)
  ) {
    return { kind: 'deadline_conflicting' };
  }

  if (
    references.some(reference => {
      return (
        typeof reference.confidence === 'number' &&
        (!Number.isFinite(reference.confidence) ||
          reference.confidence < inputMinimum(input) ||
          reference.confidence > 1)
      );
    })
  ) {
    return { kind: 'deadline_low_confidence' };
  }

  const staleAfterDays = normalizeStaleAfterDays(
    input.deadlineStaleAfterDays ?? input.staleAfterDays
  );

  if (
    references.some(reference => {
      return (
        reference.stale === true || isDeadlineReferenceStale(reference, input.now, staleAfterDays)
      );
    })
  ) {
    return { kind: 'deadline_stale' };
  }

  if (references.some(reference => reference.ambiguous === true)) {
    return { kind: 'deadline_ambiguous' };
  }

  return {
    kind: 'ready',
    deadlineReferences: uniqueEvidenceReferences(references),
  };
}

function completeDeadlineReferences(
  references: readonly ProcedureDeadlineReferenceInput[] | undefined
): readonly ProcedureDeadlineReferenceInput[] {
  return (references ?? []).filter(isCompleteDeadlineReference);
}

function uniqueEvidenceReferences(
  references: readonly ProcedureDeadlineReferenceInput[]
): readonly AssistanceEvidenceReference[] {
  const seen = new Set<string>();
  const output: AssistanceEvidenceReference[] = [];

  for (const reference of references) {
    if (!isCompleteDeadlineReference(reference)) {
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

function procedureKindFromCountryRule(
  kind: Exclude<ReturnType<typeof evaluateCountryRuleReadiness>['kind'], 'ready'>
): ProcedureGuideReadinessKind {
  if (kind === 'missing') {
    return 'missing_rule';
  }

  return kind;
}

function completeMetadataFromRules(
  rules: readonly ProcedureGuideRuleInput[]
): readonly CountryRuleMetadata[] {
  return rules
    .map(rule => rule.metadata)
    .filter((metadata): metadata is CountryRuleMetadata => isCompleteCountryRuleMetadata(metadata));
}

function findContradictingSourceReferences(
  rules: readonly ProcedureGuideRuleInput[]
): readonly string[] {
  const conclusionGroups = new Map<
    string,
    {
      conclusions: Set<ProcedureGuideRuleConclusion>;
      sourceReferences: string[];
    }
  >();

  for (const rule of rules) {
    if (rule.conclusion == null) {
      continue;
    }

    const subject = conclusionSubject(rule);
    const group =
      conclusionGroups.get(subject) ??
      ({
        conclusions: new Set<ProcedureGuideRuleConclusion>(),
        sourceReferences: [],
      } satisfies {
        conclusions: Set<ProcedureGuideRuleConclusion>;
        sourceReferences: string[];
      });

    group.conclusions.add(rule.conclusion);
    if (isCompleteCountryRuleMetadata(rule.metadata)) {
      group.sourceReferences.push(rule.metadata.sourceReference);
    }

    conclusionGroups.set(subject, group);
  }

  return [...conclusionGroups.values()]
    .filter(group => group.conclusions.size > 1)
    .flatMap(group => group.sourceReferences);
}

function conclusionSubject(rule: ProcedureGuideRuleInput): string {
  const explicitSubject = rule.conclusionSubject?.trim();

  if (explicitSubject != null && explicitSubject.length > 0) {
    return explicitSubject;
  }

  return `${rule.scenario}:${rule.participantRole}:${rule.ruleFamily}`;
}

function isCompleteCountryRuleMetadata(
  metadata?: ProcedureGuideCountryRuleMetadataInput | null
): metadata is CountryRuleMetadata {
  if (metadata == null) {
    return false;
  }

  return (
    hasNonEmptyString(metadata.country) &&
    hasNonEmptyString(metadata.sourceReference) &&
    hasNonEmptyString(metadata.owner) &&
    hasNonEmptyString(metadata.lastReviewed) &&
    typeof metadata.confidence === 'number' &&
    Number.isFinite(metadata.confidence)
  );
}

function isCompleteDeadlineReference(
  reference?: ProcedureDeadlineReferenceInput
): reference is ProcedureDeadlineReferenceInput & {
  kind: AssistanceEvidenceKind;
  referenceId: string;
  sourceReference: string;
  lastReviewed: string;
  confidence: number;
} {
  return (
    reference != null &&
    hasNonEmptyString(reference.kind) &&
    hasNonEmptyString(reference.referenceId) &&
    hasNonEmptyString(reference.sourceReference) &&
    hasNonEmptyString(reference.lastReviewed) &&
    typeof reference.confidence === 'number' &&
    Number.isFinite(reference.confidence)
  );
}

function isProcedureGuideRuleFamily(value: string): value is ProcedureGuideRuleFamily {
  return PROCEDURE_GUIDE_RULE_FAMILIES.includes(value as ProcedureGuideRuleFamily);
}

function isProcedureGuideScenario(value: string): value is ProcedureGuideScenario {
  return PROCEDURE_GUIDE_SCENARIOS.includes(value as ProcedureGuideScenario);
}

function isProcedureGuideParticipantRole(value: string): value is ProcedureGuideParticipantRole {
  return PROCEDURE_GUIDE_PARTICIPANT_ROLES.includes(value as ProcedureGuideParticipantRole);
}

function isProcedureGuideCode(value: string): value is ProcedureGuideCode {
  return PROCEDURE_GUIDE_CODES.includes(value as ProcedureGuideCode);
}

function minimumProcedureConfidence(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    return MINIMUM_COUNTRY_RULE_CONFIDENCE;
  }

  return Math.max(value, MINIMUM_COUNTRY_RULE_CONFIDENCE);
}

function normalizeStaleAfterDays(value: number | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }

  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function isDeadlineReferenceStale(
  reference: ProcedureDeadlineReferenceInput,
  now: Date,
  staleAfterDays = 180
): boolean {
  const reviewedAt = new Date(reference.lastReviewed ?? '');
  if (Number.isNaN(reviewedAt.getTime())) {
    return true;
  }

  const staleAfterMs = staleAfterDays * 24 * 60 * 60 * 1000;
  return now.getTime() - reviewedAt.getTime() > staleAfterMs;
}

function inputMinimum(input: ProcedureGuideReadinessInput): number {
  return minimumProcedureConfidence(input.minimumConfidence);
}

function uniqueNonEmptyStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map(value => value.trim()).filter(value => value.length > 0))];
}

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeCountry(country: string | undefined): string {
  return country?.trim().toUpperCase() ?? '';
}
