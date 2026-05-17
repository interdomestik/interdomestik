import { MINIMUM_COUNTRY_RULE_CONFIDENCE, type AssistanceOutcome } from '../types';
import type { CountryRuleMetadata, CountryRuleReadiness } from '../types';
import type { CountryRuleReadinessInput, CreateCountryRuleOutcomeInput } from './inputs';
import { createAssistanceOutcome } from './outcomes';

export function evaluateCountryRuleReadiness(
  input: CountryRuleReadinessInput
): CountryRuleReadiness {
  const minimumConfidence = isConfidenceValue(input.minimumConfidence)
    ? input.minimumConfidence
    : MINIMUM_COUNTRY_RULE_CONFIDENCE;
  const metadata = normalizeMetadata(input.metadata);

  if (input.supportedCountry === false) {
    return countryRuleReadiness({
      kind: 'unsupported_country',
      outcomeKind: 'unsupported_country',
      metadata,
      minimumConfidence,
    });
  }

  if (metadata.length === 0) {
    return countryRuleReadiness({
      kind: 'missing',
      outcomeKind: 'manual_review_required',
      metadata,
      minimumConfidence,
    });
  }

  if (input.scenarioSupported === false) {
    return countryRuleReadiness({
      kind: 'unsupported_scenario',
      outcomeKind: 'uncertain',
      metadata,
      minimumConfidence,
    });
  }

  if (metadata.some(rule => isCountryRuleStale(rule, input.now, input.staleAfterDays))) {
    return countryRuleReadiness({
      kind: 'stale',
      outcomeKind: 'manual_review_required',
      metadata,
      minimumConfidence,
    });
  }

  if ((input.conflictingSourceReferences ?? []).length > 0) {
    return countryRuleReadiness({
      kind: 'conflicting',
      outcomeKind: 'manual_review_required',
      metadata,
      minimumConfidence,
    });
  }

  if (
    metadata.some(
      rule => !isConfidenceValue(rule.confidence) || rule.confidence < minimumConfidence
    )
  ) {
    return countryRuleReadiness({
      kind: 'low_confidence',
      outcomeKind: 'uncertain',
      metadata,
      minimumConfidence,
    });
  }

  return {
    kind: 'ready',
    ready: true,
    outcomeKind: 'eligible',
    humanReviewRequired: false,
    reasons: [],
    minimumConfidence,
    countryRuleMetadata: metadata,
  };
}

export function createCountryRuleOutcome(input: CreateCountryRuleOutcomeInput): AssistanceOutcome {
  const readiness = evaluateCountryRuleReadiness(input);

  return createAssistanceOutcome({
    kind: readiness.ready ? (input.readyKind ?? 'eligible') : readiness.outcomeKind,
    zone: input.zone,
    reasons: readiness.reasons,
    evidence: input.evidence,
    countryRuleMetadata: readiness.countryRuleMetadata,
    humanReviewRequired: readiness.humanReviewRequired,
    provenance: input.provenance,
    piiClassification: input.piiClassification,
    createdAt: input.createdAt,
  });
}

function isConfidenceValue(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function countryRuleReadiness(params: {
  kind: Exclude<CountryRuleReadiness['kind'], 'ready'>;
  outcomeKind: CountryRuleReadiness['outcomeKind'];
  metadata: readonly CountryRuleMetadata[];
  minimumConfidence: number;
}): CountryRuleReadiness {
  return {
    kind: params.kind,
    ready: false,
    outcomeKind: params.outcomeKind,
    humanReviewRequired: true,
    reasons: [
      {
        code: `country_rule_${params.kind}`,
        messageKey: `assistance.countryRule.${params.kind}`,
      },
    ],
    minimumConfidence: params.minimumConfidence,
    countryRuleMetadata: params.metadata,
  };
}

function normalizeMetadata(
  metadata?: CountryRuleMetadata | readonly CountryRuleMetadata[] | null
): readonly CountryRuleMetadata[] {
  if (metadata == null) {
    return [];
  }

  if (Array.isArray(metadata)) {
    return metadata;
  }

  return [metadata as CountryRuleMetadata];
}

function isCountryRuleStale(
  metadata: CountryRuleMetadata,
  now: Date,
  staleAfterDays = 180
): boolean {
  const reviewedAt = new Date(metadata.lastReviewed);
  if (Number.isNaN(reviewedAt.getTime())) {
    return true;
  }

  const staleAfterMs = staleAfterDays * 24 * 60 * 60 * 1000;
  return now.getTime() - reviewedAt.getTime() > staleAfterMs;
}
