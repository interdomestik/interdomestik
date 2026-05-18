import { describe, expect, it } from 'vitest';

import { MINIMUM_COUNTRY_RULE_CONFIDENCE, type CountryRuleMetadata } from '../types';
import {
  createProcedurePack,
  evaluateProcedureGuideReadiness,
  type CreateProcedurePackInput,
  type ProcedureDeadlineReferenceInput,
  type ProcedureGuideReadinessInput,
  type ProcedureGuideRuleInput,
} from './procedure-guide';

const now = new Date('2026-05-18T12:00:00.000Z');
const createdAt = now.toISOString();

function metadata(
  country: string,
  confidence = MINIMUM_COUNTRY_RULE_CONFIDENCE
): CountryRuleMetadata {
  return {
    country,
    sourceReference: `procedure-guide/${country.toLowerCase()}/2026-05`,
    owner: 'legal-ops',
    lastReviewed: '2026-05-01',
    confidence,
  };
}

function deadline(
  input: Partial<ProcedureDeadlineReferenceInput> = {}
): ProcedureDeadlineReferenceInput {
  return {
    kind: 'country_rule',
    referenceId: 'deadline_notice_de_2026_05',
    summaryKey: 'assistance.procedureGuide.deadline.notice.de',
    sourceReference: 'procedure-guide/de/deadline-notice/2026-05',
    lastReviewed: '2026-05-01',
    confidence: MINIMUM_COUNTRY_RULE_CONFIDENCE,
    ...input,
  };
}

function rule(input: Partial<ProcedureGuideRuleInput> = {}): ProcedureGuideRuleInput {
  return {
    jurisdictionRole: 'incident_country',
    country: 'DE',
    scenario: 'traffic_collision',
    participantRole: 'member_driver',
    ruleFamily: 'post_incident_notice',
    metadata: metadata('DE'),
    supportedCountry: true,
    scenarioSupported: true,
    roleSupported: true,
    ruleFamilySupported: true,
    conclusion: 'procedure_guide_supported',
    procedureCodes: ['notice_counterparty_insurer', 'preserve_incident_documents'],
    deadlineReferences: [deadline()],
    ...input,
  };
}

function readiness(input: Partial<ProcedureGuideReadinessInput> = {}) {
  return evaluateProcedureGuideReadiness({
    zone: 'member',
    jurisdiction: 'DE',
    scenario: 'traffic_collision',
    participantRole: 'member_driver',
    requestedRuleFamily: 'post_incident_notice',
    rules: [rule()],
    now,
    ...input,
  });
}

function pack(input: Partial<CreateProcedurePackInput> = {}) {
  return createProcedurePack({
    packId: 'procedure_pack_123',
    jurisdiction: 'DE',
    scenario: 'traffic_collision',
    participantRole: 'member_driver',
    requestedRuleFamily: 'post_incident_notice',
    rules: [rule()],
    now,
    createdAt,
    ...input,
  });
}

describe('procedure guide readiness', () => {
  it('creates a member-zone procedure pack for supported rules without final legal advice', () => {
    const result = pack();

    expect(result).toMatchObject({
      packType: 'procedure',
      zone: 'member',
      requiredHumanReview: false,
      procedureCodes: ['notice_counterparty_insurer', 'preserve_incident_documents'],
      deadlineReferences: [
        {
          kind: 'country_rule',
          referenceId: 'deadline_notice_de_2026_05',
          summaryKey: 'assistance.procedureGuide.deadline.notice.de',
          sourceReference: 'procedure-guide/de/deadline-notice/2026-05',
          lastReviewed: '2026-05-01',
          confidence: MINIMUM_COUNTRY_RULE_CONFIDENCE,
        },
      ],
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
    expect(result.provenance).toEqual({
      source: 'rules',
      generatedBy: 'domain-assistance',
    });
  });

  it('can carry a structural legal-basis readiness reference', () => {
    const legalBasisReference = {
      kind: 'professional_review_reference' as const,
      referenceId: 'legal_basis_readiness_123',
      summaryKey: 'assistance.legalBasis.precheckSupported',
    };
    const result = pack({ legalBasisReference });

    expect(result.legalBasisReference).toEqual(legalBasisReference);
  });

  it('requires member-zone access for procedure guidance', () => {
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

  it('fails closed when an applicable procedure rule is missing', () => {
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
            sourceReference: 'procedure-guide/de/2026-05',
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

  it('fails closed when duplicate applicable rules conflict', () => {
    const result = readiness({
      rules: [
        rule({ conclusion: 'procedure_guide_supported' }),
        rule({
          metadata: {
            ...metadata('DE'),
            sourceReference: 'procedure-guide/de/internal-conflict',
          },
          conclusion: 'procedure_guide_unsupported',
        }),
      ],
    });

    expect(result.kind).toBe('conflicting');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed for cross-jurisdiction procedure contradictions', () => {
    const result = readiness({
      jurisdiction: 'DE',
      rules: [
        rule({
          conclusion: 'procedure_guide_supported',
        }),
        rule({
          jurisdictionRole: 'counterparty_country',
          country: 'NL',
          metadata: metadata('NL'),
          conclusion: 'procedure_guide_unsupported',
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

  it('fails closed when a procedure code is outside the supported registry', () => {
    const result = readiness({
      rules: [rule({ procedureCodes: ['activate_professional_recovery_without_consent'] })],
    });

    expect(result.kind).toBe('unsupported_procedure_code');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.procedureCodes).toEqual([]);
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when one applicable rule omits procedure codes', () => {
    const result = readiness({
      rules: [
        rule(),
        rule({
          metadata: {
            ...metadata('DE'),
            sourceReference: 'procedure-guide/de/second-rule',
          },
          procedureCodes: [],
        }),
      ],
    });

    expect(result.kind).toBe('unsupported_procedure');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.procedureCodes).toEqual([]);
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

  it('fails closed when the requested rule family is unsupported', () => {
    const result = readiness({ requestedRuleFamily: 'recovery_activation_procedure' });

    expect(result.kind).toBe('unsupported_rule_family');
    expect(result.outcomeKind).toBe('uncertain');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when an encoded procedure conclusion is unsupported', () => {
    const result = readiness({
      rules: [rule({ conclusion: 'procedure_guide_unsupported' })],
    });

    expect(result.kind).toBe('unsupported_procedure');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.procedureCodes).toEqual([]);
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when an applicable rule does not encode a procedure conclusion', () => {
    const result = readiness({
      rules: [rule({ conclusion: undefined })],
    });

    expect(result.kind).toBe('unsupported_procedure');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.procedureCodes).toEqual([]);
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

  it('fails closed when deadline evidence is missing', () => {
    const result = readiness({
      rules: [rule({ deadlineReferences: [] })],
    });

    expect(result.kind).toBe('deadline_missing');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when deadline evidence omits confidence', () => {
    const result = readiness({
      rules: [
        rule({
          deadlineReferences: [
            deadline({
              confidence: undefined,
            }),
          ],
        }),
      ],
    });

    expect(result.kind).toBe('deadline_missing');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when deadline evidence is ambiguous', () => {
    const result = readiness({
      rules: [rule({ deadlineReferences: [deadline({ ambiguous: true })] })],
    });

    expect(result.kind).toBe('deadline_ambiguous');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when deadline evidence is conflicting', () => {
    const result = readiness({
      rules: [
        rule({
          deadlineReferences: [
            deadline({
              conflictsWith: ['procedure-guide/de/deadline-notice-conflict'],
            }),
          ],
        }),
      ],
    });

    expect(result.kind).toBe('deadline_conflicting');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when deadline evidence confidence is below the launch floor', () => {
    const result = readiness({
      rules: [rule({ deadlineReferences: [deadline({ confidence: 0.79 })] })],
    });

    expect(result.kind).toBe('deadline_low_confidence');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when deadline evidence is stale', () => {
    const result = readiness({
      deadlineStaleAfterDays: 90,
      rules: [
        rule({
          deadlineReferences: [
            deadline({
              lastReviewed: '2025-01-01',
            }),
          ],
        }),
      ],
    });

    expect(result.kind).toBe('deadline_stale');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.humanReviewRequired).toBe(true);
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
          aiWorkflowName: 'procedure_guide_extract',
          aiPromptOrSchemaVersion: 'assist-procedure-guide-v1',
          aiRunId: 'airun_procedure_guide_123',
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
