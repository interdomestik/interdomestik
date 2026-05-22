import { describe, expect, it } from 'vitest';

import type {
  AssistanceDisclaimerCode,
  AssistanceOutcome,
  AssistancePackSummary,
  AssistanceProvenance,
  AssistanceSessionDigest,
  AssistanceServiceZone,
  CountryRuleMetadata,
  EscalationRecommendation,
} from '../types';
import { createAssistanceOutcome } from './outcomes';
import { createAssistanceSessionDigest } from './session-digest';
import { createAssistanceWorkflowIntents } from './workflow-intents';

const CREATED_AT = '2026-05-19T12:00:00.000Z';

const COUNTRY_RULE: CountryRuleMetadata = {
  country: 'DE',
  sourceReference: 'synthetic-workflow/de/2026-05',
  owner: 'product-legal-review',
  lastReviewed: '2026-05-01',
  confidence: 0.91,
};

const MEMBER_DISCLAIMERS: readonly AssistanceDisclaimerCode[] = [
  'not_legal_advice',
  'not_medical_advice',
  'not_insurer_assessment',
  'not_professional_opinion',
  'educational_only',
  'professional_review_required',
];

const FREE_DISCLAIMERS: readonly AssistanceDisclaimerCode[] = [
  'not_legal_advice',
  'not_medical_advice',
  'not_insurer_assessment',
  'not_professional_opinion',
  'educational_only',
];

function outcome(
  overrides: Partial<Parameters<typeof createAssistanceOutcome>[0]> = {}
): AssistanceOutcome {
  return createAssistanceOutcome({
    kind: 'eligible',
    zone: 'member',
    reasons: [{ code: 'synthetic_reason_code' }],
    evidence: [
      {
        kind: 'document_reference',
        referenceId: 'synthetic-evidence-reference',
        summaryKey: 'synthetic_evidence_summary',
        sourceReference: 'synthetic-evidence/de/2026-05',
      },
    ],
    countryRuleMetadata: [COUNTRY_RULE],
    humanReviewRequired: false,
    disclaimers: MEMBER_DISCLAIMERS,
    piiClassification: 'incident_sensitive',
    createdAt: CREATED_AT,
    ...overrides,
  });
}

function packSummary(
  packId: string,
  packType: AssistancePackSummary['packType'],
  sourceOutcome: AssistanceOutcome
): AssistancePackSummary {
  return {
    packId,
    packType,
    outcomeKind: sourceOutcome.kind,
    zone: sourceOutcome.zone,
    requiredHumanReview: sourceOutcome.humanReviewRequired,
  };
}

function digest(
  overrides: Partial<{
    sessionId: string;
    zone: AssistanceServiceZone;
    memberId: string | null;
    country: string;
    outcomes: readonly AssistanceOutcome[];
    packSummaries: readonly AssistancePackSummary[];
    escalationRecommendation: EscalationRecommendation;
    consentState: AssistanceSessionDigest['consentState'];
    disclaimersShown: readonly AssistanceDisclaimerCode[];
  }> = {}
): AssistanceSessionDigest {
  const outcomes = overrides.outcomes ?? [outcome()];
  const firstOutcome = outcomes[0];

  if (firstOutcome === undefined) {
    throw new Error('workflow intent tests require at least one outcome');
  }

  const packSummaries = overrides.packSummaries ?? [
    packSummary('pack-legal-basis-1', 'legal_basis', firstOutcome),
  ];

  return createAssistanceSessionDigest({
    sessionId: overrides.sessionId ?? 'session-workflow-1',
    zone: overrides.zone ?? 'member',
    memberId: overrides.memberId === null ? undefined : (overrides.memberId ?? 'member-workflow-1'),
    country: overrides.country ?? 'DE',
    packSummaries,
    outcomes,
    escalationRecommendation: overrides.escalationRecommendation ?? 'none',
    consentState: overrides.consentState ?? 'explicit_consent_recorded',
    disclaimersShown: overrides.disclaimersShown ?? MEMBER_DISCLAIMERS,
    createdAt: CREATED_AT,
  });
}

describe('createAssistanceWorkflowIntents', () => {
  it('returns deterministic non-executing member-zone intents for explicit-consent sessions', () => {
    const freeOutcome = outcome({
      kind: 'requires_member_zone',
      zone: 'free',
      countryRuleMetadata: [],
      disclaimers: FREE_DISCLAIMERS,
      piiClassification: 'none',
    });
    const source = digest({
      zone: 'free',
      outcomes: [freeOutcome],
      packSummaries: [packSummary('pack-incident-1', 'incident_scene', freeOutcome)],
      escalationRecommendation: 'member_zone',
      disclaimersShown: FREE_DISCLAIMERS,
    });

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      intentKind: 'blocked_workflow_intent',
      targetSurface: 'member_zone',
      executionAllowed: false,
      blocked: true,
      requiredConsentState: 'explicit_consent_recorded',
      piiClassification: 'none',
      redactionPosture: 'none',
    });
    expect(intents[0]?.blockers).toEqual(['final_or_executable_outcome_blocked']);
    expect(intents[0]?.referenceKey).toMatch(/^assist-wfi:member_zone:[a-z0-9]+$/);
  });

  it('returns an empty intent list for anonymous free-zone sessions with no target surface', () => {
    const freeOutcome = outcome({
      kind: 'eligible',
      zone: 'free',
      countryRuleMetadata: [],
      disclaimers: FREE_DISCLAIMERS,
      piiClassification: 'none',
    });
    const source = digest({
      zone: 'free',
      outcomes: [freeOutcome],
      packSummaries: [packSummary('pack-incident-1', 'incident_scene', freeOutcome)],
      escalationRecommendation: 'none',
      consentState: 'anonymous',
      disclaimersShown: FREE_DISCLAIMERS,
    });

    expect(createAssistanceWorkflowIntents(source)).toEqual([]);
  });

  it('prepares support handoff, claim context, and professional review targets without side effects', () => {
    const legalOutcome = outcome();
    const recoveryOutcome = outcome({
      kind: 'requires_professional_recovery',
      humanReviewRequired: true,
    });
    const source = digest({
      outcomes: [legalOutcome, recoveryOutcome],
      packSummaries: [
        packSummary('pack-legal-basis-1', 'legal_basis', legalOutcome),
        packSummary('pack-recovery-1', 'recovery_eligibility', recoveryOutcome),
      ],
      escalationRecommendation: 'staff_handoff',
    });

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents.map(intent => intent.targetSurface)).toEqual([
      'claim_context',
      'support_handoff',
      'professional_recovery_review',
    ]);
    expect(intents.every(intent => intent.executionAllowed === false)).toBe(true);
    expect(intents.every(intent => !('createdRecordIds' in intent))).toBe(true);
    expect(intents.every(intent => !('externalRecordIds' in intent))).toBe(true);
    expect(intents.every(intent => intent.requiredHumanReview)).toBe(true);
  });

  it('scopes evidence to the selected pack summaries instead of source-reference text', () => {
    const legalOutcome = outcome({
      evidence: [
        {
          kind: 'document_reference',
          referenceId: 'legal-basis-evidence',
          sourceReference: 'legal-basis/de/2026-05',
        },
      ],
    });
    const recoveryOutcome = outcome({
      kind: 'requires_professional_recovery',
      humanReviewRequired: true,
      evidence: [
        {
          kind: 'professional_review_reference',
          referenceId: 'recovery-evidence',
          sourceReference: 'professional-recovery/de/2026-05',
        },
      ],
    });
    const source = digest({
      outcomes: [legalOutcome, recoveryOutcome],
      packSummaries: [
        packSummary('pack-legal-basis-1', 'legal_basis', legalOutcome),
        packSummary('pack-recovery-1', 'recovery_eligibility', recoveryOutcome),
      ],
    });

    const intents = createAssistanceWorkflowIntents(source);
    const claimIntent = intents.find(intent => intent.targetSurface === 'claim_context');
    const professionalReviewIntent = intents.find(
      intent => intent.targetSurface === 'professional_recovery_review'
    );

    expect(claimIntent?.packReferences.map(reference => reference.packId)).toEqual([
      'pack-legal-basis-1',
    ]);
    expect(claimIntent?.evidence.map(reference => reference.kind)).toEqual(['document_reference']);
    expect(professionalReviewIntent?.evidence.map(reference => reference.kind)).toEqual([
      'document_reference',
      'professional_review_reference',
    ]);
  });

  it('fails closed for professional recovery recommendations instead of activating recovery', () => {
    const source = digest({
      escalationRecommendation: 'professional_recovery',
      outcomes: [outcome({ kind: 'requires_professional_recovery', humanReviewRequired: true })],
    });

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents.map(intent => intent.targetSurface)).toEqual([
      'claim_context',
      'crm_follow_up',
      'professional_recovery_review',
    ]);
    expect(
      intents.every(intent => intent.blockers.includes('professional_recovery_activation_blocked'))
    ).toBe(true);
    expect(intents.every(intent => intent.executionAllowed === false)).toBe(true);
  });

  it.each([
    [
      'missing member identity',
      digest({ memberId: null, escalationRecommendation: 'staff_handoff' }),
      'member_attachment_missing',
    ],
    [
      'missing explicit consent',
      digest({ consentState: 'declined', escalationRecommendation: 'staff_handoff' }),
      'explicit_consent_missing',
    ],
    [
      'missing disclaimers',
      digest({ disclaimersShown: ['educational_only'], escalationRecommendation: 'staff_handoff' }),
      'required_disclaimer_missing',
    ],
    [
      'missing country metadata',
      digest({
        outcomes: [outcome({ countryRuleMetadata: [] })],
        escalationRecommendation: 'staff_handoff',
      }),
      'country_rule_metadata_missing',
    ],
    [
      'unsupported outcome',
      digest({ outcomes: [outcome({ kind: 'unsupported_country' })] }),
      'final_or_executable_outcome_blocked',
    ],
  ] as const)('fails closed for %s', (_label, source, expectedBlocker) => {
    const intents = createAssistanceWorkflowIntents(source);

    expect(intents.length).toBeGreaterThan(0);
    expect(intents.some(intent => intent.blockers.includes(expectedBlocker))).toBe(true);
    expect(intents.every(intent => intent.executionAllowed === false)).toBe(true);
  });

  it('fails closed when digest summaries and ordered outcomes disagree', () => {
    const source = digest({
      packSummaries: [
        {
          packId: 'pack-legal-basis-1',
          packType: 'legal_basis',
          outcomeKind: 'eligible',
          zone: 'free',
          requiredHumanReview: false,
        },
      ],
    });

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents[0]?.blockers).toEqual(
      expect.arrayContaining(['digest_summary_outcome_mismatch'])
    );
  });

  it.each(['manual_review_required', 'uncertain', 'out_of_scope'] as const)(
    'fails closed for final or unsupported %s outcomes',
    outcomeKind => {
      const source = digest({ outcomes: [outcome({ kind: outcomeKind })] });

      const intents = createAssistanceWorkflowIntents(source);

      expect(intents[0]?.blockers).toContain('final_or_executable_outcome_blocked');
      expect(intents[0]?.executionAllowed).toBe(false);
    }
  );

  it('fails closed when country-dependent packs have no session country', () => {
    const source = {
      ...digest({ escalationRecommendation: 'staff_handoff' }),
      country: undefined,
    } as unknown as AssistanceSessionDigest;

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents[0]?.blockers).toContain('country_rule_metadata_missing');
  });

  it('requires human-review posture for sensitive medical or legal-professional digests', () => {
    const sensitive = outcome({
      piiClassification: 'medical_sensitive',
      humanReviewRequired: false,
    });
    const source = digest({
      outcomes: [sensitive],
      packSummaries: [packSummary('pack-injury-1', 'injury_category', sensitive)],
    });

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents[0]?.blockers).toContain('sensitive_human_review_missing');
    expect(intents[0]?.redactionPosture).toBe('sensitive_reference_only');
    expect(intents[0]?.requiredHumanReview).toBe(true);
  });

  it.each([
    ['legal_financial_sensitive', 'sensitive_reference_only'],
    ['professional_secret', 'professional_secret_reference_only'],
  ] as const)(
    'requires human-review posture for %s digests',
    (piiClassification, expectedRedactionPosture) => {
      const sensitive = outcome({
        piiClassification,
        humanReviewRequired: false,
      });
      const source = digest({
        outcomes: [sensitive],
        packSummaries: [packSummary('pack-legal-basis-1', 'legal_basis', sensitive)],
      });

      const intents = createAssistanceWorkflowIntents(source);

      expect(intents[0]?.blockers).toContain('sensitive_human_review_missing');
      expect(intents[0]?.requiredHumanReview).toBe(true);
      expect(intents[0]?.redactionPosture).toBe(expectedRedactionPosture);
    }
  );

  it('propagates pack-summary human-review requirements to workflow intents', () => {
    const reviewOutcome = outcome({ humanReviewRequired: false });
    const source = digest({
      outcomes: [reviewOutcome],
      packSummaries: [
        {
          ...packSummary('pack-invalidity-1', 'invalidity_review', reviewOutcome),
          requiredHumanReview: true,
        },
      ],
    });

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents[0]?.requiredHumanReview).toBe(true);
  });

  it('keeps AI-assisted provenance advisory and non-final', () => {
    const aiProvenance: AssistanceProvenance = {
      source: 'ai_assisted',
      generatedBy: 'domain-assistance',
      ai: {
        aiConfidence: 0.82,
        aiModelVersion: 'synthetic-model-2026-05',
        aiWorkflowName: 'synthetic-workflow-intent-fixture',
        aiPromptOrSchemaVersion: 'workflow-intent-v1',
        role: 'classification',
      },
    };
    const source = digest({
      outcomes: [
        outcome({
          provenance: aiProvenance,
          humanReviewRequired: true,
        }),
      ],
    });

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents[0]?.aiAdvisoryOnly).toBe(true);
    expect(intents[0]?.requiredHumanReview).toBe(true);
    expect(intents[0]?.blockers).toContain('ai_non_final_review_required');
  });

  it('blocks digests that carry created or external record identifiers', () => {
    const source = {
      ...digest(),
      createdRecordIds: ['claim-should-not-exist'],
    } as unknown as AssistanceSessionDigest;

    const intents = createAssistanceWorkflowIntents(source);

    expect(intents[0]?.blockers).toContain('created_or_external_record_ids_present');
    expect(intents[0]).not.toHaveProperty('createdRecordIds');
    expect(intents[0]).not.toHaveProperty('externalRecordIds');
  });

  it('keeps intent ordering and reference keys deterministic while drifting on meaningful changes', () => {
    const source = digest({ escalationRecommendation: 'staff_handoff' });
    const repeated = createAssistanceWorkflowIntents(source);
    const equivalent = createAssistanceWorkflowIntents(
      digest({ escalationRecommendation: 'staff_handoff' })
    );
    const changed = createAssistanceWorkflowIntents(
      digest({
        escalationRecommendation: 'staff_handoff',
        outcomes: [outcome({ reasons: [{ code: 'meaningful_contract_change' }] })],
      })
    );

    expect(repeated.map(intent => intent.targetSurface)).toEqual([
      'claim_context',
      'support_handoff',
    ]);
    expect(repeated.map(intent => intent.referenceKey)).toEqual(
      equivalent.map(intent => intent.referenceKey)
    );
    expect(repeated.map(intent => intent.referenceKey)).not.toEqual(
      changed.map(intent => intent.referenceKey)
    );
  });

  it('does not leak raw narrative, plate, VIN, medical text, or insurer correspondence into intents', () => {
    const source = digest({
      outcomes: [
        outcome({
          reasons: [
            {
              code: 'Driver wrote raw narrative with PLATE ABC-123, VIN WDD123, medical text and insurer letter',
            },
          ],
          evidence: [
            {
              kind: 'document_reference',
              referenceId:
                'Driver wrote raw narrative with PLATE ABC-123 and VIN WDD123 in insurer letter',
              summaryKey: 'medical text from expert report',
              sourceReference: 'insurer correspondence includes ABC-123 and WDD123',
            },
          ],
        }),
      ],
      escalationRecommendation: 'staff_handoff',
    });

    const intents = createAssistanceWorkflowIntents(source);
    const intentText = JSON.stringify(intents);

    expect(intentText).not.toContain('ABC-123');
    expect(intentText).not.toContain('abc-123');
    expect(intentText).not.toContain('WDD123');
    expect(intentText).not.toContain('wdd123');
    expect(intentText).not.toContain('medical text');
    expect(intentText).not.toContain('medical_text');
    expect(intentText).not.toContain('insurer letter');
    expect(intentText).not.toContain('insurer_letter');
    expect(intentText).not.toContain('expert report');
    expect(intentText).not.toContain('expert_report');
    expect(intents.flatMap(intent => intent.reasons.map(reason => reason.code))).toEqual(
      expect.arrayContaining([
        'workflow.claim_context.review_requested',
        'workflow.source_outcome.eligible',
      ])
    );
    expect(
      intents.every(intent => intent.reasons.every(reason => reason.code.startsWith('workflow.')))
    ).toBe(true);
  });
});
