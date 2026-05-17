import { describe, expect, it } from 'vitest';

import {
  AI_FINAL_DECISION_ALLOWED,
  DEFAULT_ASSISTANCE_RETENTION_POLICY,
  MINIMUM_COUNTRY_RULE_CONFIDENCE,
  createAssistanceOutcome,
  createAssistanceSessionDigest,
  createCountryRuleOutcome,
  createHelpNowIncidentScenePack,
  createInvalidityReviewBoundaryOutcome,
  evaluateCountryRuleReadiness,
  isAiFinalDecisionAllowed,
  isInvalidityCoefficientReviewAllowed,
  type CreateAssistanceSessionDigestInput,
  type CreateCountryRuleOutcomeInput,
  type CreateHelpNowIncidentScenePackInput,
  type CountryRuleMetadata,
  type IncidentScenePack,
} from './index';

const now = new Date('2026-05-17T12:00:00.000Z');
const createdAt = now.toISOString();

const freshRule: CountryRuleMetadata = {
  country: 'DE',
  sourceReference: 'green-card/de/2026-05',
  owner: 'legal-ops',
  lastReviewed: '2026-05-01',
  confidence: MINIMUM_COUNTRY_RULE_CONFIDENCE,
};

function countryOutcome(
  input: Partial<CreateCountryRuleOutcomeInput> = {}
): ReturnType<typeof createCountryRuleOutcome> {
  return createCountryRuleOutcome({
    metadata: freshRule,
    now,
    zone: 'member',
    createdAt,
    ...input,
  });
}

function helpNowPack(input: Partial<CreateHelpNowIncidentScenePackInput> = {}): IncidentScenePack {
  return createHelpNowIncidentScenePack({
    packId: 'pack_123',
    sessionId: 'session_123',
    guidanceChecklist: ['secure_scene'],
    escalationRecommendation: 'member_zone',
    createdAt,
    ...input,
  });
}

function sessionDigest(
  pack: IncidentScenePack,
  input: Partial<CreateAssistanceSessionDigestInput> = {}
): ReturnType<typeof createAssistanceSessionDigest> {
  return createAssistanceSessionDigest({
    sessionId: 'session_123',
    zone: 'free',
    memberId: 'member_123',
    packSummaries: [
      {
        packId: pack.packId,
        packType: pack.packType,
        outcomeKind: pack.outcome.kind,
        zone: pack.zone,
        requiredHumanReview: pack.requiredHumanReview,
      },
    ],
    outcomes: [pack.outcome],
    escalationRecommendation: 'member_zone',
    consentState: 'explicit_consent_recorded',
    createdAt,
    ...input,
  });
}

describe('country rule readiness', () => {
  it('passes a supported fresh rule at the launch-floor confidence threshold', () => {
    const readiness = evaluateCountryRuleReadiness({
      metadata: freshRule,
      now,
    });

    expect(readiness).toMatchObject({
      kind: 'ready',
      ready: true,
      humanReviewRequired: false,
      minimumConfidence: 0.8,
    });
  });

  it('fails closed when country rule metadata is missing', () => {
    const outcome = countryOutcome({
      metadata: null,
    });

    expect(outcome.kind).toBe('manual_review_required');
    expect(outcome.humanReviewRequired).toBe(true);
    expect(outcome.reasons.map(reason => reason.code)).toContain('country_rule_missing');
  });

  it('fails closed when a country is unsupported', () => {
    const outcome = countryOutcome({
      supportedCountry: false,
    });

    expect(outcome.kind).toBe('unsupported_country');
    expect(outcome.humanReviewRequired).toBe(true);
  });

  it('fails closed when a rule is stale', () => {
    const outcome = countryOutcome({
      metadata: {
        ...freshRule,
        lastReviewed: '2025-01-01',
      },
      staleAfterDays: 90,
    });

    expect(outcome.kind).toBe('manual_review_required');
    expect(outcome.reasons.map(reason => reason.code)).toContain('country_rule_stale');
  });

  it('fails closed when country rules conflict', () => {
    const outcome = countryOutcome({
      conflictingSourceReferences: ['green-card/de/conflict'],
    });

    expect(outcome.kind).toBe('manual_review_required');
    expect(outcome.reasons.map(reason => reason.code)).toContain('country_rule_conflicting');
  });

  it('fails closed when confidence is below 0.80', () => {
    const outcome = countryOutcome({
      metadata: {
        ...freshRule,
        confidence: 0.79,
      },
    });

    expect(outcome.kind).toBe('uncertain');
    expect(outcome.humanReviewRequired).toBe(true);
    expect(outcome.reasons.map(reason => reason.code)).toContain('country_rule_low_confidence');
  });

  it('fails closed when confidence is malformed or outside the valid range', () => {
    for (const confidence of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
      const outcome = countryOutcome({
        metadata: {
          ...freshRule,
          confidence,
        },
      });

      expect(outcome.kind).toBe('uncertain');
      expect(outcome.humanReviewRequired).toBe(true);
      expect(outcome.reasons.map(reason => reason.code)).toContain('country_rule_low_confidence');
    }
  });
});

describe('human-review and AI boundaries', () => {
  it('keeps invalidity coefficient review member-zone and human-review only', () => {
    expect(isInvalidityCoefficientReviewAllowed('free')).toBe(false);
    expect(isInvalidityCoefficientReviewAllowed('professional_recovery')).toBe(false);
    expect(isInvalidityCoefficientReviewAllowed('member')).toBe(true);

    const freeOutcome = createInvalidityReviewBoundaryOutcome({
      zone: 'free',
      createdAt,
    });
    const memberOutcome = createInvalidityReviewBoundaryOutcome({
      zone: 'member',
      createdAt,
    });

    expect(freeOutcome.kind).toBe('requires_member_zone');
    expect(freeOutcome.humanReviewRequired).toBe(true);
    expect(memberOutcome.kind).toBe('manual_review_required');
    expect(memberOutcome.humanReviewRequired).toBe(true);
  });

  it('types AI provenance but blocks AI final decisioning', () => {
    const outcome = createAssistanceOutcome({
      kind: 'eligible',
      zone: 'member',
      createdAt,
      provenance: {
        source: 'ai_assisted',
        generatedBy: 'domain-assistance',
        ai: {
          aiConfidence: 0.91,
          aiModelVersion: 'gpt-5.5',
          aiWorkflowName: 'claim_intake_extract',
          aiPromptOrSchemaVersion: 'assist-v1',
          aiRunId: 'airun_123',
          role: 'classification',
        },
      },
    });

    expect(AI_FINAL_DECISION_ALLOWED).toBe(false);
    expect(isAiFinalDecisionAllowed()).toBe(false);
    expect(outcome.kind).toBe('manual_review_required');
    expect(outcome.humanReviewRequired).toBe(true);
    expect(outcome.reasons.map(reason => reason.code)).toContain('ai_final_decision_blocked');
    expect(outcome.provenance.ai?.aiModelVersion).toBe('gpt-5.5');
  });
});

describe('Help Now and escalation digest contracts', () => {
  it('creates a free-zone Help Now incident scene pack without PII', () => {
    const pack = helpNowPack({
      country: 'DE',
      guidanceChecklist: ['secure_scene', 'collect_evidence'],
    });

    expect(pack.packType).toBe('incident_scene');
    expect(pack.zone).toBe('free');
    expect(pack.piiClassification).toBe('none');
    expect(pack.outcome.piiClassification).toBe('none');
    expect(pack.retentionPolicyKey).toBe(DEFAULT_ASSISTANCE_RETENTION_POLICY);
    expect(pack.retentionPolicyKey).not.toContain('placeholder');
    expect(pack.requiredDisclaimers).toEqual(
      expect.arrayContaining([
        'not_legal_advice',
        'not_medical_advice',
        'not_insurer_assessment',
        'educational_only',
      ])
    );
  });

  it('maps professional recovery escalation to its dedicated outcome kind', () => {
    const pack = helpNowPack({
      escalationRecommendation: 'professional_recovery',
    });

    expect(pack.outcome.kind).toBe('requires_professional_recovery');
    expect(pack.escalationRecommendation).toBe('professional_recovery');
  });

  it('represents consented escalation without external record creation fields', () => {
    const digest = sessionDigest(helpNowPack());

    expect(digest).toMatchObject({
      sessionId: 'session_123',
      zone: 'free',
      memberId: 'member_123',
      consentState: 'explicit_consent_recorded',
      escalationRecommendation: 'member_zone',
      piiClassification: 'none',
    });
    expect('externalRecordIds' in digest).toBe(false);
    expect('createdRecordIds' in digest).toBe(false);
  });

  it('omits member identifiers from escalation digests unless consent is explicit', () => {
    const digest = sessionDigest(helpNowPack(), {
      consentState: 'anonymous',
    });

    expect('memberId' in digest).toBe(false);
  });
});
