import type { AssistanceOutcomeKind, AssistanceReason, CountryRuleMetadata } from '../types';
import { MINIMUM_COUNTRY_RULE_CONFIDENCE } from '../types';
import { evaluateCountryRuleReadiness } from './country-rules';

export const GREEN_CARD_RULE_FAMILIES = ['green_card'] as const;

export type GreenCardRuleFamily = (typeof GREEN_CARD_RULE_FAMILIES)[number];

export const GREEN_CARD_SCENARIOS = [
  'coverage_confirmation',
  'cross_border_incident',
  'counterparty_insurer_contact',
  'document_requirements',
] as const;

export type GreenCardScenario = (typeof GREEN_CARD_SCENARIOS)[number];

export const GREEN_CARD_JURISDICTION_ROLES = [
  'incident_country',
  'vehicle_registration_country',
  'insurer_or_counterparty_country',
] as const;

export type GreenCardJurisdictionRole = (typeof GREEN_CARD_JURISDICTION_ROLES)[number];

export const GREEN_CARD_RULE_CONCLUSIONS = [
  'green_card_ready',
  'green_card_not_required',
  'green_card_unsupported',
] as const;

export type GreenCardRuleConclusion = (typeof GREEN_CARD_RULE_CONCLUSIONS)[number];

export type GreenCardCountryRuleReadinessKind =
  | 'ready'
  | 'missing'
  | 'stale'
  | 'conflicting'
  | 'unsupported_country'
  | 'unsupported_rule_family'
  | 'unsupported_scenario'
  | 'low_confidence'
  | 'metadata_incomplete';

export type GreenCardCountryRuleMetadataInput = Partial<CountryRuleMetadata>;

export interface GreenCardCountryRuleJurisdictionInput {
  role: GreenCardJurisdictionRole;
  country: string;
  scenario: GreenCardScenario;
  metadata?: GreenCardCountryRuleMetadataInput | null;
  supportedCountry?: boolean;
  scenarioSupported?: boolean;
  conclusion?: GreenCardRuleConclusion;
  conclusionSubject?: string;
}

export interface GreenCardCountryRuleReadinessInput {
  incidentCountry: string;
  vehicleRegistrationCountry?: string;
  insurerOrCounterpartyCountry?: string;
  scenario: GreenCardScenario;
  ruleFamily?: string;
  jurisdictions: readonly GreenCardCountryRuleJurisdictionInput[];
  now: Date;
  staleAfterDays?: number;
  minimumConfidence?: number;
  conflictingSourceReferences?: readonly string[];
}

export interface GreenCardApplicableJurisdiction {
  role: GreenCardJurisdictionRole;
  country: string;
  scenario: GreenCardScenario;
}

export interface GreenCardCountryRuleReadiness {
  kind: GreenCardCountryRuleReadinessKind;
  ready: boolean;
  outcomeKind: AssistanceOutcomeKind;
  humanReviewRequired: boolean;
  reasons: readonly AssistanceReason[];
  minimumConfidence: number;
  countryRuleMetadata: readonly CountryRuleMetadata[];
  ruleFamily: string;
  scenario: GreenCardScenario;
  applicableJurisdictions: readonly GreenCardApplicableJurisdiction[];
}

export function evaluateGreenCardCountryRuleReadiness(
  input: GreenCardCountryRuleReadinessInput
): GreenCardCountryRuleReadiness {
  const minimumConfidence = minimumGreenCardConfidence(input.minimumConfidence);
  const ruleFamily = input.ruleFamily ?? 'green_card';
  const applicableJurisdictions = expectedJurisdictions(input);

  if (ruleFamily !== 'green_card') {
    return greenCardReadiness({
      kind: 'unsupported_rule_family',
      outcomeKind: 'uncertain',
      minimumConfidence,
      ruleFamily,
      scenario: input.scenario,
      applicableJurisdictions,
      metadata: completeMetadataFromRules(input.jurisdictions),
    });
  }

  const applicableRules = applicableJurisdictions.map(jurisdiction => {
    return {
      jurisdiction,
      rules: findJurisdictionRules(input.jurisdictions, jurisdiction),
    };
  });

  if (applicableRules.some(item => item.rules.length === 0)) {
    return greenCardReadiness({
      kind: 'missing',
      outcomeKind: 'manual_review_required',
      minimumConfidence,
      ruleFamily,
      scenario: input.scenario,
      applicableJurisdictions,
      metadata: completeMetadataFromRules(input.jurisdictions),
    });
  }

  const incompleteRule = applicableRules.find(item => {
    return item.rules.some(rule => !isCompleteCountryRuleMetadata(rule.metadata));
  });

  if (incompleteRule != null) {
    return greenCardReadiness({
      kind: 'metadata_incomplete',
      outcomeKind: 'manual_review_required',
      minimumConfidence,
      ruleFamily,
      scenario: input.scenario,
      applicableJurisdictions,
      metadata: completeMetadataFromRules(input.jurisdictions),
    });
  }

  const rules = applicableRules.flatMap(item => item.rules);
  const metadata = rules.map(rule => rule.metadata as CountryRuleMetadata);
  const metadataCountryMismatch = applicableRules.some(item => {
    return item.rules.some(
      rule => normalizeCountry(rule.metadata?.country) !== item.jurisdiction.country
    );
  });
  const conflictingSourceReferences = [
    ...(input.conflictingSourceReferences ?? []),
    ...findContradictingSourceReferences(rules),
  ];

  if (metadataCountryMismatch) {
    conflictingSourceReferences.push('green-card/metadata-country-mismatch');
  }

  const readiness = evaluateCountryRuleReadiness({
    metadata,
    now: input.now,
    staleAfterDays: normalizeStaleAfterDays(input.staleAfterDays),
    minimumConfidence,
    supportedCountry: !rules.some(rule => rule.supportedCountry === false),
    scenarioSupported: !rules.some(rule => rule.scenarioSupported === false),
    conflictingSourceReferences,
  });

  return {
    kind: readiness.kind,
    ready: readiness.ready,
    outcomeKind: readiness.outcomeKind,
    humanReviewRequired: readiness.humanReviewRequired,
    reasons: readiness.reasons,
    minimumConfidence: readiness.minimumConfidence,
    countryRuleMetadata: readiness.countryRuleMetadata,
    ruleFamily,
    scenario: input.scenario,
    applicableJurisdictions,
  };
}

function greenCardReadiness(params: {
  kind: Exclude<GreenCardCountryRuleReadinessKind, 'ready'>;
  outcomeKind: AssistanceOutcomeKind;
  minimumConfidence: number;
  ruleFamily: string;
  scenario: GreenCardScenario;
  applicableJurisdictions: readonly GreenCardApplicableJurisdiction[];
  metadata: readonly CountryRuleMetadata[];
}): GreenCardCountryRuleReadiness {
  return {
    kind: params.kind,
    ready: false,
    outcomeKind: params.outcomeKind,
    humanReviewRequired: true,
    reasons: [
      {
        code: `green_card_country_rule_${params.kind}`,
        messageKey: `assistance.greenCard.countryRule.${params.kind}`,
      },
    ],
    minimumConfidence: params.minimumConfidence,
    countryRuleMetadata: params.metadata,
    ruleFamily: params.ruleFamily,
    scenario: params.scenario,
    applicableJurisdictions: params.applicableJurisdictions,
  };
}

function expectedJurisdictions(
  input: GreenCardCountryRuleReadinessInput
): readonly GreenCardApplicableJurisdiction[] {
  const jurisdictions: GreenCardApplicableJurisdiction[] = [
    {
      role: 'incident_country',
      country: normalizeCountry(input.incidentCountry),
      scenario: input.scenario,
    },
  ];

  appendJurisdiction(
    jurisdictions,
    'vehicle_registration_country',
    input.vehicleRegistrationCountry,
    input.scenario
  );
  appendJurisdiction(
    jurisdictions,
    'insurer_or_counterparty_country',
    input.insurerOrCounterpartyCountry,
    input.scenario
  );

  return jurisdictions.filter(jurisdiction => jurisdiction.country.length > 0);
}

function appendJurisdiction(
  jurisdictions: GreenCardApplicableJurisdiction[],
  role: GreenCardJurisdictionRole,
  country: string | undefined,
  scenario: GreenCardScenario
): void {
  const normalizedCountry = normalizeCountry(country);

  if (normalizedCountry.length === 0) {
    return;
  }

  if (
    jurisdictions.some(
      jurisdiction => jurisdiction.role === role && jurisdiction.country === normalizedCountry
    )
  ) {
    return;
  }

  jurisdictions.push({ role, country: normalizedCountry, scenario });
}

function findJurisdictionRules(
  rules: readonly GreenCardCountryRuleJurisdictionInput[],
  jurisdiction: GreenCardApplicableJurisdiction
): readonly GreenCardCountryRuleJurisdictionInput[] {
  return rules.filter(rule => {
    return (
      rule.role === jurisdiction.role &&
      normalizeCountry(rule.country) === jurisdiction.country &&
      rule.scenario === jurisdiction.scenario
    );
  });
}

function isCompleteCountryRuleMetadata(
  metadata?: GreenCardCountryRuleMetadataInput | null
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

function completeMetadataFromRules(
  rules: readonly GreenCardCountryRuleJurisdictionInput[]
): readonly CountryRuleMetadata[] {
  return rules
    .map(rule => rule.metadata)
    .filter((metadata): metadata is CountryRuleMetadata => isCompleteCountryRuleMetadata(metadata));
}

function findContradictingSourceReferences(
  rules: readonly (GreenCardCountryRuleJurisdictionInput | undefined)[]
): readonly string[] {
  const conclusionGroups = new Map<
    string,
    {
      conclusions: Set<GreenCardRuleConclusion>;
      sourceReferences: string[];
    }
  >();

  for (const rule of rules) {
    if (rule?.conclusion == null) {
      continue;
    }

    const subject = conclusionSubject(rule);
    const group =
      conclusionGroups.get(subject) ??
      ({
        conclusions: new Set<GreenCardRuleConclusion>(),
        sourceReferences: [],
      } satisfies {
        conclusions: Set<GreenCardRuleConclusion>;
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

function minimumGreenCardConfidence(value: number | undefined): number {
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

function conclusionSubject(rule: GreenCardCountryRuleJurisdictionInput): string {
  const explicitSubject = rule.conclusionSubject?.trim();

  if (explicitSubject != null && explicitSubject.length > 0) {
    return explicitSubject;
  }

  return `${rule.role}:${normalizeCountry(rule.country)}:${rule.scenario}`;
}

function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeCountry(country: string | undefined): string {
  return country?.trim().toUpperCase() ?? '';
}
