import type {
  AssistanceDisclaimerCode,
  AssistanceEvidenceReference,
  AssistanceOutcome,
  AssistanceOutcomeKind,
  AssistanceProvenance,
  AssistanceReason,
  AssistanceServiceZone,
  CountryRuleMetadata,
  LegalBasisPack,
  PiiClassification,
} from '../types';
import { MINIMUM_COUNTRY_RULE_CONFIDENCE } from '../types';
import { DEFAULT_ASSISTANCE_PROVENANCE, DEFAULT_ASSISTANCE_RETENTION_POLICY } from './constants';
import { evaluateCountryRuleReadiness } from './country-rules';
import { getRequiredDisclaimerCodes } from './disclaimers';
import { createAssistanceOutcome } from './outcomes';

export const LEGAL_BASIS_RULE_FAMILIES = [
  'traffic_liability_basis',
  'insurance_coverage_basis',
  'cross_border_recovery_basis',
] as const;

export type LegalBasisRuleFamily = (typeof LEGAL_BASIS_RULE_FAMILIES)[number];

export const LEGAL_BASIS_SCENARIOS = [
  'traffic_collision',
  'cross_border_collision',
  'coverage_dispute',
] as const;

export type LegalBasisScenario = (typeof LEGAL_BASIS_SCENARIOS)[number];

export const LEGAL_BASIS_PARTICIPANT_ROLES = [
  'member_driver',
  'member_passenger',
  'member_owner',
  'counterparty_driver',
] as const;

export type LegalBasisParticipantRole = (typeof LEGAL_BASIS_PARTICIPANT_ROLES)[number];

export const LEGAL_BASIS_JURISDICTION_ROLES = [
  'incident_country',
  'member_residence_country',
  'counterparty_country',
] as const;

export type LegalBasisJurisdictionRole = (typeof LEGAL_BASIS_JURISDICTION_ROLES)[number];

export const LEGAL_BASIS_RULE_CONCLUSIONS = [
  'legal_basis_precheck_supported',
  'legal_basis_precheck_unsupported',
  'professional_review_required',
] as const;

export type LegalBasisRuleConclusion = (typeof LEGAL_BASIS_RULE_CONCLUSIONS)[number];

export type LegalBasisReadinessKind =
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
  | 'unsupported_legal_basis'
  | 'low_confidence'
  | 'out_of_scope'
  | 'professional_review_required';

export type LegalBasisCountryRuleMetadataInput = Partial<CountryRuleMetadata>;

export interface LegalBasisRuleInput {
  jurisdictionRole: LegalBasisJurisdictionRole;
  country: string;
  scenario: LegalBasisScenario;
  participantRole: LegalBasisParticipantRole;
  ruleFamily: LegalBasisRuleFamily;
  metadata?: LegalBasisCountryRuleMetadataInput | null;
  supportedCountry?: boolean;
  scenarioSupported?: boolean;
  roleSupported?: boolean;
  ruleFamilySupported?: boolean;
  conclusion?: LegalBasisRuleConclusion;
  conclusionSubject?: string;
  requiresLegalInterpretation?: boolean;
  requiresProfessionalRecovery?: boolean;
}

export interface LegalBasisReadinessInput {
  zone: AssistanceServiceZone;
  jurisdiction?: string;
  scenario: LegalBasisScenario | string;
  participantRole: LegalBasisParticipantRole | string;
  requestedRuleFamily: LegalBasisRuleFamily | string;
  rules: readonly LegalBasisRuleInput[];
  now: Date;
  staleAfterDays?: number;
  minimumConfidence?: number;
  conflictingSourceReferences?: readonly string[];
  requiresLegalInterpretation?: boolean;
  requiresProfessionalRecovery?: boolean;
}

export interface LegalBasisReadiness {
  kind: LegalBasisReadinessKind;
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
  legalBasisCodes: readonly string[];
  requiredDisclaimers: readonly AssistanceDisclaimerCode[];
}

export interface CreateLegalBasisPackInput extends Omit<LegalBasisReadinessInput, 'zone'> {
  packId: string;
  createdAt: string;
  evidence?: readonly AssistanceEvidenceReference[];
  provenance?: AssistanceProvenance;
  piiClassification?: PiiClassification;
}

export function evaluateLegalBasisPrecheck(input: LegalBasisReadinessInput): LegalBasisReadiness {
  const minimumConfidence = minimumLegalBasisConfidence(input.minimumConfidence);
  const jurisdiction = normalizeCountry(input.jurisdiction);
  const metadata = completeMetadataFromRules(input.rules);
  const base = {
    minimumConfidence,
    countryRuleMetadata: metadata,
    jurisdiction,
    scenario: input.scenario,
    participantRole: input.participantRole,
    requestedRuleFamily: input.requestedRuleFamily,
  };

  if (input.zone === 'professional_recovery' || input.requiresProfessionalRecovery === true) {
    return legalBasisReadiness({
      ...base,
      kind: 'requires_professional_recovery',
      outcomeKind: 'requires_professional_recovery',
    });
  }

  if (input.zone !== 'member') {
    return legalBasisReadiness({
      ...base,
      kind: 'requires_member_zone',
      outcomeKind: 'requires_member_zone',
    });
  }

  if (jurisdiction.length === 0) {
    return legalBasisReadiness({
      ...base,
      kind: 'missing_jurisdiction',
      outcomeKind: 'manual_review_required',
    });
  }

  if (!isLegalBasisRuleFamily(input.requestedRuleFamily)) {
    return legalBasisReadiness({
      ...base,
      kind: 'unsupported_rule_family',
      outcomeKind: 'uncertain',
    });
  }

  if (!isLegalBasisScenario(input.scenario)) {
    return legalBasisReadiness({
      ...base,
      kind: 'unsupported_scenario',
      outcomeKind: 'uncertain',
    });
  }

  if (!isLegalBasisParticipantRole(input.participantRole)) {
    return legalBasisReadiness({
      ...base,
      kind: 'unsupported_role',
      outcomeKind: 'uncertain',
    });
  }

  const applicableRules = input.rules.filter(rule => isApplicableRule(rule, input, jurisdiction));
  const relevantRules = input.rules.filter(rule => isRelevantLegalBasisRule(rule, input));

  if (applicableRules.length === 0) {
    return legalBasisReadiness({
      ...base,
      kind: 'missing_rule',
      outcomeKind: 'manual_review_required',
    });
  }

  if (applicableRules.some(rule => !isCompleteCountryRuleMetadata(rule.metadata))) {
    return legalBasisReadiness({
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
    conflictingSourceReferences.push('legal-basis/metadata-country-mismatch');
  }

  if (applicableRules.some(rule => rule.requiresProfessionalRecovery === true)) {
    return legalBasisReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'requires_professional_recovery',
      outcomeKind: 'requires_professional_recovery',
    });
  }

  if (applicableRules.some(rule => rule.ruleFamilySupported === false)) {
    return legalBasisReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'unsupported_rule_family',
      outcomeKind: 'uncertain',
    });
  }

  if (applicableRules.some(rule => rule.roleSupported === false)) {
    return legalBasisReadiness({
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
    return legalBasisReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'out_of_scope',
      outcomeKind: 'out_of_scope',
    });
  }

  if (applicableRules.some(rule => rule.conclusion === 'professional_review_required')) {
    return legalBasisReadiness({
      ...base,
      countryRuleMetadata: applicableMetadata,
      kind: 'professional_review_required',
      outcomeKind: 'manual_review_required',
    });
  }

  const readiness = evaluateCountryRuleReadiness({
    metadata: applicableMetadata,
    now: input.now,
    staleAfterDays: normalizeStaleAfterDays(input.staleAfterDays),
    minimumConfidence,
    supportedCountry: !applicableRules.some(rule => rule.supportedCountry === false),
    scenarioSupported: !applicableRules.some(rule => rule.scenarioSupported === false),
    conflictingSourceReferences,
  });

  if (readiness.kind !== 'ready') {
    return {
      ...base,
      kind: legalBasisKindFromCountryRule(readiness.kind),
      ready: false,
      outcomeKind: readiness.outcomeKind,
      humanReviewRequired: true,
      reasons: readiness.reasons,
      minimumConfidence: readiness.minimumConfidence,
      countryRuleMetadata: readiness.countryRuleMetadata,
      legalBasisCodes: [],
      requiredDisclaimers: getRequiredDisclaimerCodes('member'),
    };
  }

  if (applicableRules.some(rule => rule.conclusion === 'legal_basis_precheck_unsupported')) {
    return legalBasisReadiness({
      ...base,
      countryRuleMetadata: readiness.countryRuleMetadata,
      kind: 'unsupported_legal_basis',
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
        code: 'legal_basis_precheck_supported',
        messageKey: 'assistance.legalBasis.precheckSupported',
      },
    ],
    minimumConfidence: readiness.minimumConfidence,
    countryRuleMetadata: readiness.countryRuleMetadata,
    legalBasisCodes: legalBasisCodes(applicableRules),
    requiredDisclaimers: getRequiredDisclaimerCodes('member'),
  };
}

export function createLegalBasisPack(input: CreateLegalBasisPackInput): LegalBasisPack {
  const readiness = evaluateLegalBasisPrecheck({
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
    packType: 'legal_basis',
    outcome,
    zone: 'member',
    inputsSummary: [
      { code: readiness.jurisdiction ? `country:${readiness.jurisdiction}` : 'country:unknown' },
      { code: `legal_basis_scenario:${readiness.scenario}` },
      { code: `legal_basis_role:${readiness.participantRole}` },
      { code: `legal_basis_rule_family:${readiness.requestedRuleFamily}` },
    ],
    requiredDisclaimers: readiness.requiredDisclaimers,
    requiredHumanReview,
    countryRuleMetadata: readiness.countryRuleMetadata,
    piiClassification: input.piiClassification ?? 'identifier_minimal',
    retentionPolicyKey: DEFAULT_ASSISTANCE_RETENTION_POLICY,
    provenance: input.provenance ?? DEFAULT_ASSISTANCE_PROVENANCE,
    legalBasisCodes: readiness.legalBasisCodes,
  };
}

function legalBasisReadiness(params: {
  kind: Exclude<LegalBasisReadinessKind, 'ready'>;
  outcomeKind: AssistanceOutcomeKind;
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  jurisdiction: string;
  scenario: string;
  participantRole: string;
  requestedRuleFamily: string;
}): LegalBasisReadiness {
  return {
    kind: params.kind,
    ready: false,
    outcomeKind: params.outcomeKind,
    humanReviewRequired: true,
    reasons: [
      {
        code: `legal_basis_${params.kind}`,
        messageKey: `assistance.legalBasis.${params.kind}`,
      },
    ],
    minimumConfidence: params.minimumConfidence,
    countryRuleMetadata: params.countryRuleMetadata,
    jurisdiction: params.jurisdiction,
    scenario: params.scenario,
    participantRole: params.participantRole,
    requestedRuleFamily: params.requestedRuleFamily,
    legalBasisCodes: [],
    requiredDisclaimers: getRequiredDisclaimerCodes('member'),
  };
}

function isRelevantLegalBasisRule(
  rule: LegalBasisRuleInput,
  input: LegalBasisReadinessInput
): boolean {
  return (
    rule.scenario === input.scenario &&
    rule.participantRole === input.participantRole &&
    rule.ruleFamily === input.requestedRuleFamily
  );
}

function isApplicableRule(
  rule: LegalBasisRuleInput,
  input: LegalBasisReadinessInput,
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

function legalBasisCodes(rules: readonly LegalBasisRuleInput[]): readonly string[] {
  return rules
    .map(rule => rule.conclusion)
    .filter(
      (conclusion): conclusion is LegalBasisRuleConclusion =>
        conclusion != null && conclusion !== 'professional_review_required'
    );
}

function legalBasisKindFromCountryRule(
  kind: Exclude<ReturnType<typeof evaluateCountryRuleReadiness>['kind'], 'ready'>
): LegalBasisReadinessKind {
  if (kind === 'missing') {
    return 'missing_rule';
  }

  return kind;
}

function completeMetadataFromRules(
  rules: readonly LegalBasisRuleInput[]
): readonly CountryRuleMetadata[] {
  return rules
    .map(rule => rule.metadata)
    .filter((metadata): metadata is CountryRuleMetadata => isCompleteCountryRuleMetadata(metadata));
}

function findContradictingSourceReferences(
  rules: readonly LegalBasisRuleInput[]
): readonly string[] {
  const conclusionGroups = new Map<
    string,
    {
      conclusions: Set<LegalBasisRuleConclusion>;
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
        conclusions: new Set<LegalBasisRuleConclusion>(),
        sourceReferences: [],
      } satisfies {
        conclusions: Set<LegalBasisRuleConclusion>;
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

function conclusionSubject(rule: LegalBasisRuleInput): string {
  const explicitSubject = rule.conclusionSubject?.trim();

  if (explicitSubject != null && explicitSubject.length > 0) {
    return explicitSubject;
  }

  return `${rule.jurisdictionRole}:${normalizeCountry(rule.country)}:${rule.scenario}:${
    rule.participantRole
  }:${rule.ruleFamily}`;
}

function isCompleteCountryRuleMetadata(
  metadata?: LegalBasisCountryRuleMetadataInput | null
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

function isLegalBasisRuleFamily(value: string): value is LegalBasisRuleFamily {
  return LEGAL_BASIS_RULE_FAMILIES.includes(value as LegalBasisRuleFamily);
}

function isLegalBasisScenario(value: string): value is LegalBasisScenario {
  return LEGAL_BASIS_SCENARIOS.includes(value as LegalBasisScenario);
}

function isLegalBasisParticipantRole(value: string): value is LegalBasisParticipantRole {
  return LEGAL_BASIS_PARTICIPANT_ROLES.includes(value as LegalBasisParticipantRole);
}

function minimumLegalBasisConfidence(value: number | undefined): number {
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

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeCountry(country: string | undefined): string {
  return country?.trim().toUpperCase() ?? '';
}
