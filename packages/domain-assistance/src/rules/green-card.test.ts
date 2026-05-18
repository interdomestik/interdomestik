import { describe, expect, it } from 'vitest';

import { MINIMUM_COUNTRY_RULE_CONFIDENCE, type CountryRuleMetadata } from '../types';
import {
  evaluateGreenCardCountryRuleReadiness,
  type GreenCardCountryRuleJurisdictionInput,
  type GreenCardCountryRuleReadinessInput,
} from './green-card';

const now = new Date('2026-05-18T12:00:00.000Z');

function metadata(
  country: string,
  confidence = MINIMUM_COUNTRY_RULE_CONFIDENCE
): CountryRuleMetadata {
  return {
    country,
    sourceReference: `green-card/${country.toLowerCase()}/2026-05`,
    owner: 'legal-ops',
    lastReviewed: '2026-05-01',
    confidence,
  };
}

function rule(
  input: Partial<GreenCardCountryRuleJurisdictionInput> = {}
): GreenCardCountryRuleJurisdictionInput {
  return {
    role: 'incident_country',
    country: 'DE',
    scenario: 'coverage_confirmation',
    metadata: metadata('DE'),
    supportedCountry: true,
    scenarioSupported: true,
    conclusion: 'green_card_ready',
    ...input,
  };
}

function readiness(input: Partial<GreenCardCountryRuleReadinessInput> = {}) {
  return evaluateGreenCardCountryRuleReadiness({
    incidentCountry: 'DE',
    scenario: 'coverage_confirmation',
    jurisdictions: [rule()],
    now,
    ...input,
  });
}

describe('Green Card country-rule readiness', () => {
  it('marks a supported Green Card scenario ready with required metadata at the 0.80 floor', () => {
    const result = readiness();

    expect(result).toMatchObject({
      kind: 'ready',
      ready: true,
      outcomeKind: 'eligible',
      humanReviewRequired: false,
      minimumConfidence: 0.8,
      ruleFamily: 'green_card',
      scenario: 'coverage_confirmation',
    });
    expect(result.countryRuleMetadata).toEqual([metadata('DE')]);
    expect(result.applicableJurisdictions).toEqual([
      { role: 'incident_country', country: 'DE', scenario: 'coverage_confirmation' },
    ]);
  });

  it('models cross-jurisdiction Green Card inputs when every applicable rule is ready', () => {
    const result = readiness({
      incidentCountry: 'DE',
      vehicleRegistrationCountry: 'FR',
      insurerOrCounterpartyCountry: 'NL',
      scenario: 'cross_border_incident',
      jurisdictions: [
        rule({
          role: 'incident_country',
          country: 'DE',
          scenario: 'cross_border_incident',
          metadata: metadata('DE'),
        }),
        rule({
          role: 'vehicle_registration_country',
          country: 'FR',
          scenario: 'cross_border_incident',
          metadata: metadata('FR'),
        }),
        rule({
          role: 'insurer_or_counterparty_country',
          country: 'NL',
          scenario: 'cross_border_incident',
          metadata: metadata('NL'),
        }),
      ],
    });

    expect(result.kind).toBe('ready');
    expect(result.applicableJurisdictions).toEqual([
      { role: 'incident_country', country: 'DE', scenario: 'cross_border_incident' },
      { role: 'vehicle_registration_country', country: 'FR', scenario: 'cross_border_incident' },
      {
        role: 'insurer_or_counterparty_country',
        country: 'NL',
        scenario: 'cross_border_incident',
      },
    ]);
    expect(result.countryRuleMetadata.map(item => item.country)).toEqual(['DE', 'FR', 'NL']);
  });

  it('fails closed when an applicable country rule is missing', () => {
    const result = readiness({
      vehicleRegistrationCountry: 'FR',
      jurisdictions: [rule()],
    });

    expect(result.kind).toBe('missing');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
    expect(result.countryRuleMetadata).toEqual([metadata('DE')]);
    expect(result.reasons.map(reason => reason.code)).toContain('green_card_country_rule_missing');
  });

  it('fails closed when required country-rule metadata is incomplete', () => {
    const result = readiness({
      jurisdictions: [
        rule({
          metadata: {
            country: 'DE',
            sourceReference: 'green-card/de/2026-05',
            lastReviewed: '2026-05-01',
            confidence: 0.91,
          },
        }),
      ],
    });

    expect(result.kind).toBe('metadata_incomplete');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
    expect(result.reasons.map(reason => reason.code)).toContain(
      'green_card_country_rule_metadata_incomplete'
    );
  });

  it('fails closed when a present applicable rule has missing metadata', () => {
    const result = readiness({
      jurisdictions: [rule({ metadata: null })],
    });

    expect(result.kind).toBe('metadata_incomplete');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
    expect(result.reasons.map(reason => reason.code)).toContain(
      'green_card_country_rule_metadata_incomplete'
    );
  });

  it('fails closed when a country is unsupported', () => {
    const result = readiness({
      jurisdictions: [rule({ supportedCountry: false })],
    });

    expect(result.kind).toBe('unsupported_country');
    expect(result.outcomeKind).toBe('unsupported_country');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when the requested Green Card scenario is unsupported', () => {
    const result = readiness({
      scenario: 'document_requirements',
      jurisdictions: [rule({ scenario: 'document_requirements', scenarioSupported: false })],
    });

    expect(result.kind).toBe('unsupported_scenario');
    expect(result.outcomeKind).toBe('uncertain');
    expect(result.humanReviewRequired).toBe(true);
    expect(result.countryRuleMetadata).toEqual([metadata('DE')]);
  });

  it('fails closed when no rule proves the requested Green Card scenario', () => {
    const result = readiness({
      scenario: 'document_requirements',
      jurisdictions: [rule({ scenario: 'coverage_confirmation' })],
    });

    expect(result.kind).toBe('missing');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when an applicable rule is stale', () => {
    const result = readiness({
      staleAfterDays: 90,
      jurisdictions: [
        rule({
          metadata: {
            ...metadata('DE'),
            lastReviewed: '2025-01-01',
          },
        }),
      ],
    });

    expect(result.kind).toBe('stale');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.reasons.map(reason => reason.code)).toContain('country_rule_stale');
  });

  it('normalizes invalid stale thresholds before checking freshness', () => {
    const result = readiness({
      staleAfterDays: Number.POSITIVE_INFINITY,
      jurisdictions: [
        rule({
          metadata: {
            ...metadata('DE'),
            lastReviewed: '2025-01-01',
          },
        }),
      ],
    });

    expect(result.kind).toBe('stale');
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it('fails closed when applicable country rules conflict', () => {
    const result = readiness({
      conflictingSourceReferences: ['green-card/de/conflict'],
    });

    expect(result.kind).toBe('conflicting');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when duplicate rules for one jurisdiction contradict each other', () => {
    const result = readiness({
      jurisdictions: [
        rule({
          role: 'incident_country',
          country: 'DE',
          metadata: metadata('DE'),
          conclusion: 'green_card_ready',
        }),
        rule({
          role: 'incident_country',
          country: 'DE',
          metadata: {
            ...metadata('DE'),
            sourceReference: 'green-card/de/internal-conflict',
          },
          conclusion: 'green_card_unsupported',
        }),
      ],
    });

    expect(result.kind).toBe('conflicting');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when cross-jurisdiction conclusions contradict each other', () => {
    const result = readiness({
      incidentCountry: 'DE',
      insurerOrCounterpartyCountry: 'NL',
      jurisdictions: [
        rule({
          role: 'incident_country',
          country: 'DE',
          metadata: metadata('DE'),
          conclusion: 'green_card_ready',
          conclusionSubject: 'shared-cross-border-green-card-requirement',
        }),
        rule({
          role: 'insurer_or_counterparty_country',
          country: 'NL',
          scenario: 'coverage_confirmation',
          metadata: metadata('NL'),
          conclusion: 'green_card_not_required',
          conclusionSubject: 'shared-cross-border-green-card-requirement',
        }),
      ],
    });

    expect(result.kind).toBe('conflicting');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('allows scoped per-jurisdiction conclusion differences without treating them as conflicts', () => {
    const result = readiness({
      incidentCountry: 'DE',
      insurerOrCounterpartyCountry: 'NL',
      jurisdictions: [
        rule({
          role: 'incident_country',
          country: 'DE',
          metadata: metadata('DE'),
          conclusion: 'green_card_ready',
        }),
        rule({
          role: 'insurer_or_counterparty_country',
          country: 'NL',
          metadata: metadata('NL'),
          conclusion: 'green_card_not_required',
        }),
      ],
    });

    expect(result.kind).toBe('ready');
    expect(result.humanReviewRequired).toBe(false);
  });

  it('fails closed when confidence falls below the active floor', () => {
    const result = readiness({
      jurisdictions: [rule({ metadata: metadata('DE', 0.79) })],
    });

    expect(result.kind).toBe('low_confidence');
    expect(result.outcomeKind).toBe('uncertain');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('does not allow callers to lower the 0.80 confidence floor', () => {
    const result = readiness({
      minimumConfidence: 0.5,
      jurisdictions: [rule({ metadata: metadata('DE', 0.79) })],
    });

    expect(result.kind).toBe('low_confidence');
    expect(result.minimumConfidence).toBe(0.8);
  });

  it('fails closed for unsupported rule families supplied by untrusted adapter records', () => {
    const result = readiness({
      ruleFamily: 'green_card_legacy',
    });

    expect(result.kind).toBe('unsupported_rule_family');
    expect(result.outcomeKind).toBe('uncertain');
    expect(result.humanReviewRequired).toBe(true);
    expect(result.countryRuleMetadata).toEqual([metadata('DE')]);
  });
});
