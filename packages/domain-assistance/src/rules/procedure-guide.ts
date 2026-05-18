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
  const base = procedureReadinessContext(input, jurisdiction, minimumConfidence, metadata);
  const closed = (
    kind: Exclude<ProcedureGuideReadinessKind, 'ready'>,
    outcomeKind: AssistanceOutcomeKind,
    countryRuleMetadata: readonly CountryRuleMetadata[] = base.countryRuleMetadata
  ) => {
    return procedureReadiness({
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

  if (jurisdiction.length === 0) {
    return closed('missing_jurisdiction', 'manual_review_required');
  }

  if (!isProcedureGuideRuleFamily(input.requestedRuleFamily)) {
    return closed('unsupported_rule_family', 'uncertain');
  }

  if (!isProcedureGuideScenario(input.scenario)) {
    return closed('unsupported_scenario', 'uncertain');
  }

  if (!isProcedureGuideParticipantRole(input.participantRole)) {
    return closed('unsupported_role', 'uncertain');
  }

  const applicableRules = input.rules.filter(rule => isApplicableRule(rule, input, jurisdiction));
  const relevantRules = input.rules.filter(rule => isRelevantProcedureRule(rule, input));

  if (applicableRules.length === 0) {
    return closed('missing_rule', 'manual_review_required');
  }

  if (applicableRules.some(rule => !isCompleteCountryRuleMetadata(rule.metadata))) {
    return closed('metadata_incomplete', 'manual_review_required');
  }

  const applicableMetadata = collectApplicableRuleMetadata(applicableRules);
  const conflictingSourceReferences = procedureConflictingSourceReferences({
    explicitReferences: input.conflictingSourceReferences,
    relevantRules,
    applicableRules,
    jurisdiction,
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

  if (
    input.requiresLegalInterpretation === true ||
    applicableRules.some(rule => rule.requiresLegalInterpretation === true)
  ) {
    return closed('out_of_scope', 'out_of_scope', applicableMetadata);
  }

  if (
    applicableRules.some(
      rule =>
        rule.requiresProfessionalReview === true ||
        rule.conclusion === 'professional_review_required'
    )
  ) {
    return closed('professional_review_required', 'manual_review_required', applicableMetadata);
  }

  const countryRuleReadiness = evaluateProcedureCountryReadiness(input, {
    metadata: applicableMetadata,
    minimumConfidence,
    rules: applicableRules,
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
    return closed(
      'unsupported_procedure',
      'manual_review_required',
      countryRuleReadiness.countryRuleMetadata
    );
  }

  if (applicableRules.some(rule => uniqueNonEmptyStrings(rule.procedureCodes ?? []).length === 0)) {
    return closed(
      'unsupported_procedure',
      'manual_review_required',
      countryRuleReadiness.countryRuleMetadata
    );
  }

  const procedureCodes = uniqueNonEmptyStrings(
    applicableRules.flatMap(rule => rule.procedureCodes ?? [])
  );

  if (procedureCodes.some(code => !isProcedureGuideCode(code))) {
    return closed(
      'unsupported_procedure_code',
      'manual_review_required',
      countryRuleReadiness.countryRuleMetadata
    );
  }

  const deadlineReadiness = evaluateDeadlineReferences(input, applicableRules);

  if (deadlineReadiness.kind !== 'ready') {
    return closed(
      deadlineReadiness.kind,
      'manual_review_required',
      countryRuleReadiness.countryRuleMetadata
    );
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
  const outcome = createProcedureOutcome(input, readiness);

  return {
    packType: 'procedure',
    packId: input.packId,
    zone: 'member',
    outcome,
    procedureCodes: readiness.procedureCodes,
    deadlineReferences: readiness.deadlineReferences,
    legalBasisReference: readiness.legalBasisReference,
    inputsSummary: procedureInputsSummary(readiness),
    requiredHumanReview: readiness.humanReviewRequired || outcome.humanReviewRequired,
    requiredDisclaimers: readiness.requiredDisclaimers,
    piiClassification: input.piiClassification ?? 'identifier_minimal',
    countryRuleMetadata: readiness.countryRuleMetadata,
    provenance: input.provenance ?? DEFAULT_ASSISTANCE_PROVENANCE,
    retentionPolicyKey: DEFAULT_ASSISTANCE_RETENTION_POLICY,
  };
}

function procedureInputsSummary(
  readiness: ProcedureGuideReadiness
): ProcedurePack['inputsSummary'] {
  const countryCode =
    readiness.jurisdiction.length > 0 ? `country:${readiness.jurisdiction}` : 'country:unknown';

  return [
    { code: countryCode },
    { code: `procedure_scenario:${readiness.scenario}` },
    { code: `procedure_role:${readiness.participantRole}` },
    { code: `procedure_rule_family:${readiness.requestedRuleFamily}` },
  ];
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

function procedureReadinessContext(
  input: ProcedureGuideReadinessInput,
  jurisdiction: string,
  minimumConfidence: number,
  countryRuleMetadata: readonly CountryRuleMetadata[]
) {
  return {
    requestedRuleFamily: input.requestedRuleFamily,
    participantRole: input.participantRole,
    scenario: input.scenario,
    legalBasisReference: input.legalBasisReference,
    jurisdiction,
    countryRuleMetadata,
    minimumConfidence,
  };
}

function collectApplicableRuleMetadata(
  rules: readonly ProcedureGuideRuleInput[]
): readonly CountryRuleMetadata[] {
  const metadata: CountryRuleMetadata[] = [];

  for (const rule of rules) {
    metadata.push(rule.metadata as CountryRuleMetadata);
  }

  return metadata;
}

function procedureConflictingSourceReferences(params: {
  explicitReferences?: readonly string[];
  relevantRules: readonly ProcedureGuideRuleInput[];
  applicableRules: readonly ProcedureGuideRuleInput[];
  jurisdiction: string;
}): string[] {
  const sourceReferences = [
    ...(params.explicitReferences ?? []),
    ...findContradictingSourceReferences(params.relevantRules),
  ];

  const hasCountryMismatch = params.applicableRules.some(rule => {
    return normalizeCountry(rule.metadata?.country) !== params.jurisdiction;
  });

  if (hasCountryMismatch) {
    sourceReferences.push('procedure-guide/metadata-country-mismatch');
  }

  return sourceReferences;
}

function evaluateProcedureCountryReadiness(
  input: ProcedureGuideReadinessInput,
  params: {
    metadata: readonly CountryRuleMetadata[];
    minimumConfidence: number;
    rules: readonly ProcedureGuideRuleInput[];
    conflictingSourceReferences: readonly string[];
  }
): ReturnType<typeof evaluateCountryRuleReadiness> {
  const supportedCountry = params.rules.every(rule => rule.supportedCountry !== false);
  const scenarioSupported = params.rules.every(rule => rule.scenarioSupported !== false);

  return evaluateCountryRuleReadiness({
    conflictingSourceReferences: params.conflictingSourceReferences,
    scenarioSupported,
    supportedCountry,
    minimumConfidence: params.minimumConfidence,
    staleAfterDays: normalizeStaleAfterDays(input.staleAfterDays),
    now: input.now,
    metadata: params.metadata,
  });
}

function createProcedureOutcome(
  input: CreateProcedurePackInput,
  readiness: ProcedureGuideReadiness
): AssistanceOutcome & { zone: 'member' } {
  return createAssistanceOutcome({
    createdAt: input.createdAt,
    piiClassification: input.piiClassification ?? 'identifier_minimal',
    provenance: input.provenance,
    disclaimers: readiness.requiredDisclaimers,
    humanReviewRequired: readiness.humanReviewRequired,
    countryRuleMetadata: readiness.countryRuleMetadata,
    evidence: input.evidence,
    reasons: readiness.reasons,
    zone: 'member',
    kind: readiness.outcomeKind,
  }) as AssistanceOutcome & { zone: 'member' };
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
  return [
    normalizeCountry(rule.country) === jurisdiction && rule.jurisdictionRole === 'incident_country',
    rule.scenario === input.scenario,
    rule.participantRole === input.participantRole,
    rule.ruleFamily === input.requestedRuleFamily,
  ].every(Boolean);
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
  const metadata: CountryRuleMetadata[] = [];

  for (const rule of rules) {
    if (isCompleteCountryRuleMetadata(rule.metadata)) {
      metadata.push(rule.metadata);
    }
  }

  return metadata;
}

function findContradictingSourceReferences(
  rules: readonly ProcedureGuideRuleInput[]
): readonly string[] {
  const groupedRules = new Map<string, ProcedureGuideRuleInput[]>();

  for (const rule of rules) {
    if (rule.conclusion == null) {
      continue;
    }

    const subject = conclusionSubject(rule);
    const nextGroup = groupedRules.get(subject) ?? [];
    nextGroup.push(rule);
    groupedRules.set(subject, nextGroup);
  }

  return [...groupedRules.values()].flatMap(group => {
    const uniqueConclusions = new Set(group.map(rule => rule.conclusion));

    if (uniqueConclusions.size <= 1) {
      return [];
    }

    return group.flatMap(rule => {
      return isCompleteCountryRuleMetadata(rule.metadata) ? [rule.metadata.sourceReference] : [];
    });
  });
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
  if (metadata == null || !COUNTRY_METADATA_TEXT_FIELDS.every(field => isFilled(metadata[field]))) {
    return false;
  }

  return isFiniteConfidence(metadata.confidence);
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
  if (!isFiniteConfidence(value) || value < 0 || value > 1) {
    return MINIMUM_COUNTRY_RULE_CONFIDENCE;
  }

  return value < MINIMUM_COUNTRY_RULE_CONFIDENCE ? MINIMUM_COUNTRY_RULE_CONFIDENCE : value;
}

function normalizeStaleAfterDays(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function isDeadlineReferenceStale(
  reference: ProcedureDeadlineReferenceInput,
  now: Date,
  staleAfterDays = 180
): boolean {
  const reviewedAtMs = Date.parse(reference.lastReviewed ?? '');
  if (!Number.isFinite(reviewedAtMs)) {
    return true;
  }

  const staleAfterMs = staleAfterDays * 24 * 60 * 60 * 1000;
  return now.getTime() - reviewedAtMs > staleAfterMs;
}

function inputMinimum(input: ProcedureGuideReadinessInput): number {
  return minimumProcedureConfidence(input.minimumConfidence);
}

function uniqueNonEmptyStrings(values: readonly string[]): readonly string[] {
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length > 0 && !output.includes(normalized)) {
      output.push(normalized);
    }
  }

  return output;
}

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isFiniteConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeCountry(country: string | undefined): string {
  return typeof country === 'string' ? country.trim().toLocaleUpperCase('en-US') : '';
}
