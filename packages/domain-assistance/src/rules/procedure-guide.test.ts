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

function expectClosed(
  result: ReturnType<typeof readiness>,
  expected: {
    kind: ReturnType<typeof readiness>['kind'];
    outcomeKind: ReturnType<typeof readiness>['outcomeKind'];
    procedureCodes?: readonly string[];
  }
) {
  expect(result.kind).toBe(expected.kind);
  expect(result.outcomeKind).toBe(expected.outcomeKind);
  expect(result.humanReviewRequired).toBe(true);

  if (expected.procedureCodes != null) {
    expect(result.procedureCodes).toEqual(expected.procedureCodes);
  }
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

  it.each([
    [
      'requires member-zone access for procedure guidance',
      { zone: 'free' },
      { kind: 'requires_member_zone', outcomeKind: 'requires_member_zone' },
    ],
    [
      'fails closed for Professional-Recovery-like inputs',
      { requiresProfessionalRecovery: true },
      {
        kind: 'requires_professional_recovery',
        outcomeKind: 'requires_professional_recovery',
      },
    ],
    [
      'fails closed when jurisdiction is missing',
      { jurisdiction: '' },
      { kind: 'missing_jurisdiction', outcomeKind: 'manual_review_required' },
    ],
    [
      'fails closed when an applicable procedure rule is missing',
      { rules: [] },
      { kind: 'missing_rule', outcomeKind: 'manual_review_required' },
    ],
  ] as const)('%s', (_name, input, expected) => {
    expectClosed(readiness(input), expected);
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

    expectClosed(result, {
      kind: 'metadata_incomplete',
      outcomeKind: 'manual_review_required',
    });
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

    expectClosed(result, {
      kind: 'conflicting',
      outcomeKind: 'manual_review_required',
    });
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

    expectClosed(result, {
      kind: 'unsupported_country',
      outcomeKind: 'unsupported_country',
    });
  });

  it.each([
    [
      'fails closed when a procedure code is outside the supported registry',
      { rules: [rule({ procedureCodes: ['activate_professional_recovery_without_consent'] })] },
      {
        kind: 'unsupported_procedure_code',
        outcomeKind: 'manual_review_required',
        procedureCodes: [],
      },
    ],
    [
      'fails closed when one applicable rule omits procedure codes',
      {
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
      },
      {
        kind: 'unsupported_procedure',
        outcomeKind: 'manual_review_required',
        procedureCodes: [],
      },
    ],
    [
      'fails closed when the scenario is unsupported',
      { rules: [rule({ scenarioSupported: false })] },
      { kind: 'unsupported_scenario', outcomeKind: 'uncertain' },
    ],
    [
      'fails closed when the participant role is unsupported',
      { rules: [rule({ roleSupported: false })] },
      { kind: 'unsupported_role', outcomeKind: 'uncertain' },
    ],
    [
      'fails closed when the requested rule family is unsupported',
      { requestedRuleFamily: 'recovery_activation_procedure' },
      { kind: 'unsupported_rule_family', outcomeKind: 'uncertain' },
    ],
    [
      'fails closed when an encoded procedure conclusion is unsupported',
      { rules: [rule({ conclusion: 'procedure_guide_unsupported' })] },
      {
        kind: 'unsupported_procedure',
        outcomeKind: 'manual_review_required',
        procedureCodes: [],
      },
    ],
    [
      'fails closed when an applicable rule does not encode a procedure conclusion',
      { rules: [rule({ conclusion: undefined })] },
      {
        kind: 'unsupported_procedure',
        outcomeKind: 'manual_review_required',
        procedureCodes: [],
      },
    ],
  ] as const)('%s', (_name, input, expected) => {
    expectClosed(readiness(input), expected);
  });

  it('fails closed when confidence falls below the 0.80 launch floor', () => {
    const result = readiness({
      rules: [rule({ metadata: metadata('DE', 0.79) })],
    });

    expectClosed(result, {
      kind: 'low_confidence',
      outcomeKind: 'uncertain',
    });
    expect(result.minimumConfidence).toBe(0.8);
  });

  it('does not allow callers to lower the confidence floor', () => {
    const result = readiness({
      minimumConfidence: 0.5,
      rules: [rule({ metadata: metadata('DE', 0.79) })],
    });

    expect(result.kind).toBe('low_confidence');
    expect(result.minimumConfidence).toBe(0.8);
  });

  it.each([
    [
      'fails closed when deadline evidence is missing',
      { rules: [rule({ deadlineReferences: [] })] },
      { kind: 'deadline_missing', outcomeKind: 'manual_review_required' },
    ],
    [
      'fails closed when deadline evidence omits confidence',
      {
        rules: [
          rule({
            deadlineReferences: [
              deadline({
                confidence: undefined,
              }),
            ],
          }),
        ],
      },
      { kind: 'deadline_missing', outcomeKind: 'manual_review_required' },
    ],
    [
      'fails closed when deadline evidence is ambiguous',
      { rules: [rule({ deadlineReferences: [deadline({ ambiguous: true })] })] },
      { kind: 'deadline_ambiguous', outcomeKind: 'manual_review_required' },
    ],
    [
      'fails closed when deadline evidence is conflicting',
      {
        rules: [
          rule({
            deadlineReferences: [
              deadline({
                conflictsWith: ['procedure-guide/de/deadline-notice-conflict'],
              }),
            ],
          }),
        ],
      },
      { kind: 'deadline_conflicting', outcomeKind: 'manual_review_required' },
    ],
    [
      'fails closed when deadline evidence confidence is below the launch floor',
      { rules: [rule({ deadlineReferences: [deadline({ confidence: 0.79 })] })] },
      { kind: 'deadline_low_confidence', outcomeKind: 'manual_review_required' },
    ],
  ] as const)('%s', (_name, input, expected) => {
    expectClosed(readiness(input), expected);
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

    expectClosed(result, {
      kind: 'deadline_stale',
      outcomeKind: 'manual_review_required',
    });
  });

  it('fails closed when inputs require legal interpretation beyond encoded rules', () => {
    const result = readiness({ requiresLegalInterpretation: true });

    expectClosed(result, {
      kind: 'out_of_scope',
      outcomeKind: 'out_of_scope',
    });
  });

  it('requires manual review when the encoded rule requires professional review', () => {
    const result = readiness({
      rules: [rule({ conclusion: 'professional_review_required' })],
    });

    expectClosed(result, {
      kind: 'professional_review_required',
      outcomeKind: 'manual_review_required',
    });
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
