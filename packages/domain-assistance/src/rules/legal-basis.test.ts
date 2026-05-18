import { describe, expect, it } from 'vitest';

import { MINIMUM_COUNTRY_RULE_CONFIDENCE, type CountryRuleMetadata } from '../types';
import {
  createLegalBasisPack,
  evaluateLegalBasisPrecheck,
  type CreateLegalBasisPackInput,
  type LegalBasisReadinessInput,
  type LegalBasisRuleInput,
} from './legal-basis';

const now = new Date('2026-05-18T12:00:00.000Z');
const createdAt = now.toISOString();

function metadata(
  country: string,
  confidence = MINIMUM_COUNTRY_RULE_CONFIDENCE
): CountryRuleMetadata {
  return {
    country,
    sourceReference: `legal-basis/${country.toLowerCase()}/2026-05`,
    owner: 'legal-ops',
    lastReviewed: '2026-05-01',
    confidence,
  };
}

function rule(input: Partial<LegalBasisRuleInput> = {}): LegalBasisRuleInput {
  return {
    jurisdictionRole: 'incident_country',
    country: 'DE',
    scenario: 'traffic_collision',
    participantRole: 'member_driver',
    ruleFamily: 'traffic_liability_basis',
    metadata: metadata('DE'),
    supportedCountry: true,
    scenarioSupported: true,
    roleSupported: true,
    ruleFamilySupported: true,
    conclusion: 'legal_basis_precheck_supported',
    ...input,
  };
}

function readiness(input: Partial<LegalBasisReadinessInput> = {}) {
  return evaluateLegalBasisPrecheck({
    zone: 'member',
    jurisdiction: 'DE',
    scenario: 'traffic_collision',
    participantRole: 'member_driver',
    requestedRuleFamily: 'traffic_liability_basis',
    rules: [rule()],
    now,
    ...input,
  });
}

function pack(input: Partial<CreateLegalBasisPackInput> = {}) {
  return createLegalBasisPack({
    packId: 'legal_basis_pack_123',
    jurisdiction: 'DE',
    scenario: 'traffic_collision',
    participantRole: 'member_driver',
    requestedRuleFamily: 'traffic_liability_basis',
    rules: [rule()],
    now,
    createdAt,
    ...input,
  });
}

describe('legal-basis pre-check readiness', () => {
  it('creates a member-zone legal-basis pack for supported rules without final advice', () => {
    const result = pack();

    expect(result).toMatchObject({
      packType: 'legal_basis',
      zone: 'member',
      requiredHumanReview: false,
      legalBasisCodes: ['legal_basis_precheck_supported'],
      piiClassification: 'identifier_minimal',
    });
    expect(result.outcome).toMatchObject({
      kind: 'eligible',
      zone: 'member',
      humanReviewRequired: false,
      piiClassification: 'identifier_minimal',
    });
    expect(result.requiredDisclaimers).toEqual(
      expect.arrayContaining([
        'not_legal_advice',
        'not_insurer_assessment',
        'professional_review_required',
      ])
    );
    expect(result.countryRuleMetadata).toEqual([metadata('DE')]);
  });

  it('requires member-zone access for legal-basis pre-checks', () => {
    const result = readiness({ zone: 'free' });

    expect(result.kind).toBe('requires_member_zone');
    expect(result.outcomeKind).toBe('requires_member_zone');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed for Professional-Recovery-like inputs', () => {
    const result = readiness({ requiresProfessionalRecovery: true });

    expect(result.kind).toBe('requires_professional_recovery');
    expect(result.outcomeKind).toBe('requires_professional_recovery');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when jurisdiction is missing', () => {
    const result = readiness({ jurisdiction: '' });

    expect(result.kind).toBe('missing_jurisdiction');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when an applicable legal-basis rule is missing', () => {
    const result = readiness({ rules: [] });

    expect(result.kind).toBe('missing_rule');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when country-rule metadata is incomplete', () => {
    const result = readiness({
      rules: [
        rule({
          metadata: {
            country: 'DE',
            sourceReference: 'legal-basis/de/2026-05',
            lastReviewed: '2026-05-01',
            confidence: 0.91,
          },
        }),
      ],
    });

    expect(result.kind).toBe('metadata_incomplete');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when an applicable rule is stale', () => {
    const result = readiness({
      staleAfterDays: 90,
      rules: [
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

  it('fails closed when applicable rules conflict', () => {
    const result = readiness({
      rules: [
        rule({ conclusion: 'legal_basis_precheck_supported' }),
        rule({
          metadata: {
            ...metadata('DE'),
            sourceReference: 'legal-basis/de/internal-conflict',
          },
          conclusion: 'legal_basis_precheck_unsupported',
        }),
      ],
    });

    expect(result.kind).toBe('conflicting');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed for cross-jurisdiction conflicts on the same legal-basis subject', () => {
    const result = readiness({
      jurisdiction: 'DE',
      rules: [
        rule({
          conclusion: 'legal_basis_precheck_supported',
          conclusionSubject: 'shared-cross-border-liability-basis',
        }),
        rule({
          jurisdictionRole: 'counterparty_country',
          country: 'NL',
          metadata: metadata('NL'),
          conclusion: 'legal_basis_precheck_unsupported',
          conclusionSubject: 'shared-cross-border-liability-basis',
        }),
      ],
    });

    expect(result.kind).toBe('conflicting');
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it('fails closed when a country is unsupported', () => {
    const result = readiness({
      rules: [rule({ supportedCountry: false })],
    });

    expect(result.kind).toBe('unsupported_country');
    expect(result.outcomeKind).toBe('unsupported_country');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when the scenario is unsupported', () => {
    const result = readiness({
      rules: [rule({ scenarioSupported: false })],
    });

    expect(result.kind).toBe('unsupported_scenario');
    expect(result.outcomeKind).toBe('uncertain');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when the participant role is unsupported', () => {
    const result = readiness({
      rules: [rule({ roleSupported: false })],
    });

    expect(result.kind).toBe('unsupported_role');
    expect(result.outcomeKind).toBe('uncertain');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when an encoded legal-basis conclusion is unsupported', () => {
    const result = readiness({
      rules: [rule({ conclusion: 'legal_basis_precheck_unsupported' })],
    });

    expect(result.kind).toBe('unsupported_legal_basis');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.legalBasisCodes).toEqual([]);
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when the requested rule family is unsupported', () => {
    const result = readiness({ requestedRuleFamily: 'recovery_activation_basis' });

    expect(result.kind).toBe('unsupported_rule_family');
    expect(result.outcomeKind).toBe('uncertain');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when confidence falls below the 0.80 launch floor', () => {
    const result = readiness({
      rules: [rule({ metadata: metadata('DE', 0.79) })],
    });

    expect(result.kind).toBe('low_confidence');
    expect(result.outcomeKind).toBe('uncertain');
    expect(result.minimumConfidence).toBe(0.8);
    expect(result.humanReviewRequired).toBe(true);
  });

  it('does not allow callers to lower the confidence floor', () => {
    const result = readiness({
      minimumConfidence: 0.5,
      rules: [rule({ metadata: metadata('DE', 0.79) })],
    });

    expect(result.kind).toBe('low_confidence');
    expect(result.minimumConfidence).toBe(0.8);
  });

  it('fails closed when inputs require legal interpretation beyond encoded rules', () => {
    const result = readiness({ requiresLegalInterpretation: true });

    expect(result.kind).toBe('out_of_scope');
    expect(result.outcomeKind).toBe('out_of_scope');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('requires manual review when the encoded rule requires professional review', () => {
    const result = readiness({
      rules: [rule({ conclusion: 'professional_review_required' })],
    });

    expect(result.kind).toBe('professional_review_required');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('keeps pack-level human review aligned when AI-assisted provenance is supplied', () => {
    const result = pack({
      provenance: {
        source: 'ai_assisted',
        generatedBy: 'domain-assistance',
        ai: {
          aiConfidence: 0.91,
          aiModelVersion: 'gpt-5.5',
          aiWorkflowName: 'legal_basis_extract',
          aiPromptOrSchemaVersion: 'assist-legal-basis-v1',
          aiRunId: 'airun_legal_basis_123',
          role: 'classification',
        },
      },
    });

    expect(result.outcome.kind).toBe('manual_review_required');
    expect(result.outcome.humanReviewRequired).toBe(true);
    expect(result.outcome.reasons.map(reason => reason.code)).toContain(
      'ai_final_decision_blocked'
    );
    expect(result.requiredHumanReview).toBe(true);
  });
});
