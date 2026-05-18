import { describe, expect, it } from 'vitest';
import type { AssistanceProvenance } from '../types';
import {
  INJURY_PRIVACY_ALIGNMENT,
  createInjuryCategoryPack,
  evaluateInjuryCategoryPrecheck,
  type InjuryCategoryReadinessInput,
  type InjuryCategoryRuleInput,
} from './injury-category';

const NOW = new Date('2026-05-18T10:00:00.000Z');

const BASE_METADATA = {
  country: 'DE',
  sourceReference: 'synthetic-injury-rule/de/2026-01',
  owner: 'product-legal-review',
  lastReviewed: '2026-05-01',
  confidence: 0.91,
};

const BASE_EVIDENCE = {
  kind: 'document_reference' as const,
  referenceId: 'synthetic-medical-reference-1',
  summaryKey: 'synthetic_injury_summary_fracture_reported',
  sourceReference: 'synthetic-injury-evidence/de/2026-01',
  lastReviewed: '2026-05-01',
  confidence: 0.9,
};

function rule(overrides: Partial<InjuryCategoryRuleInput> = {}): InjuryCategoryRuleInput {
  return {
    country: 'DE',
    scenario: 'traffic_collision',
    participantRole: 'member_driver',
    ruleFamily: 'injury_category_precheck',
    metadata: BASE_METADATA,
    categoryCodes: ['fracture_or_dislocation_reported'],
    severityBand: 'serious_reported',
    evidenceReferences: [BASE_EVIDENCE],
    ...overrides,
  };
}

function input(
  overrides: Partial<InjuryCategoryReadinessInput> = {}
): InjuryCategoryReadinessInput {
  return {
    zone: 'member',
    applicableJurisdictionCountry: 'de',
    incidentCountry: 'de',
    scenario: 'traffic_collision',
    participantRole: 'member_driver',
    requestedRuleFamily: 'injury_category_precheck',
    rules: [rule()],
    now: NOW,
    sensitiveHealthEvidence: true,
    medicalDocumentConsentRecorded: true,
    article9ExplicitConsentRecorded: true,
    ...overrides,
  };
}

describe('evaluateInjuryCategoryPrecheck', () => {
  it('returns a supported member-zone injury category pre-check with privacy alignment', () => {
    const result = evaluateInjuryCategoryPrecheck(input());

    expect(result).toMatchObject({
      kind: 'ready',
      ready: true,
      outcomeKind: 'eligible',
      humanReviewRequired: false,
      applicableJurisdictionCountry: 'DE',
      incidentCountry: 'DE',
      categoryCodes: ['fracture_or_dislocation_reported'],
      severityBand: 'serious_reported',
      privacyAlignment: INJURY_PRIVACY_ALIGNMENT,
    });
    expect(result.minimumConfidence).toBe(0.8);
    expect(result.requiredDisclaimers).toEqual(
      expect.arrayContaining([
        'not_medical_advice',
        'not_legal_advice',
        'not_insurer_assessment',
        'professional_review_required',
      ])
    );
    expect(result.evidenceReferences).toEqual([BASE_EVIDENCE]);
  });

  it('creates a member injury pack without raw medical narrative fields', () => {
    const pack = createInjuryCategoryPack({
      ...input(),
      packId: 'injury-pack-1',
      createdAt: '2026-05-18T10:00:00.000Z',
    });

    expect(pack.packType).toBe('injury_category');
    expect(pack.zone).toBe('member');
    expect(pack.outcome.piiClassification).toBe('medical_sensitive');
    expect(pack.retentionPolicyKey).toBe('member_assistance_sensitive_health_v1');
    expect(pack.privacyAlignment.documentSensitivity).toBe('sensitive_health');
    expect(pack.evidenceReferences[0]?.summaryKey).toBe(
      'synthetic_injury_summary_fracture_reported'
    );
    expect(JSON.stringify(pack)).not.toContain('real claimant');
  });

  it('requires member zone for injury category pre-checks', () => {
    const result = evaluateInjuryCategoryPrecheck(input({ zone: 'free' }));

    expect(result.kind).toBe('requires_member_zone');
    expect(result.outcomeKind).toBe('requires_member_zone');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('keeps Professional Recovery-like inputs out of injury pre-check decisions', () => {
    const result = evaluateInjuryCategoryPrecheck(input({ requiresProfessionalRecovery: true }));

    expect(result.kind).toBe('requires_professional_recovery');
    expect(result.outcomeKind).toBe('requires_professional_recovery');
  });

  it.each([
    ['missing jurisdiction', { applicableJurisdictionCountry: '' }, 'missing_jurisdiction'],
    ['unsupported scenario', { scenario: 'parking_lot_fall' }, 'unsupported_scenario'],
    ['unsupported role', { participantRole: 'counterparty_driver' }, 'unsupported_role'],
    ['unsupported family', { requestedRuleFamily: 'invalidity_review' }, 'unsupported_rule_family'],
  ] as const)('fails closed for %s', (_label, overrides, expectedKind) => {
    const result = evaluateInjuryCategoryPrecheck(input(overrides));

    expect(result.kind).toBe(expectedKind);
    expect(result.ready).toBe(false);
    expect(result.humanReviewRequired).toBe(true);
  });

  it('requires a deterministic jurisdiction tie-breaker when incident country differs', () => {
    const result = evaluateInjuryCategoryPrecheck(
      input({ applicableJurisdictionCountry: 'DE', incidentCountry: 'IT' })
    );

    expect(result.kind).toBe('jurisdiction_tie_breaker_missing');
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it('supports cross-border input when jurisdiction tie-breaker is explicit', () => {
    const result = evaluateInjuryCategoryPrecheck(
      input({
        applicableJurisdictionCountry: 'DE',
        incidentCountry: 'IT',
        jurisdictionTieBreakerReason: 'member_policy_applies_de_rules',
      })
    );

    expect(result.kind).toBe('ready');
    expect(result.incidentCountry).toBe('IT');
    expect(result.applicableJurisdictionCountry).toBe('DE');
  });

  it.each([
    ['missing rule', [], 'missing_rule'],
    ['metadata incomplete', [rule({ metadata: { country: 'DE' } })], 'metadata_incomplete'],
    ['stale rule', [rule({ metadata: { ...BASE_METADATA, lastReviewed: '2024-01-01' } })], 'stale'],
    [
      'conflicting rules',
      [rule(), rule({ categoryCodes: ['soft_tissue_reported'], severityBand: 'minor_reported' })],
      'conflicting',
    ],
    ['unsupported country', [rule({ supportedCountry: false })], 'unsupported_country'],
    ['unsupported scenario flag', [rule({ scenarioSupported: false })], 'unsupported_scenario'],
    ['unsupported role flag', [rule({ roleSupported: false })], 'unsupported_role'],
    ['unsupported family flag', [rule({ ruleFamilySupported: false })], 'unsupported_rule_family'],
    [
      'low confidence',
      [rule({ metadata: { ...BASE_METADATA, confidence: 0.79 } })],
      'low_confidence',
    ],
    [
      'unsupported category',
      [rule({ categoryCodes: ['icd10_s72_external_code'] })],
      'unsupported_injury_category',
    ],
    ['missing category', [rule({ categoryCodes: [] })], 'unsupported_injury_category'],
    [
      'unsupported severity',
      [rule({ severityBand: 'diagnosed_severe' })],
      'unsupported_severity_band',
    ],
  ] as const)('fails closed for %s', (_label, rules, expectedKind) => {
    const result = evaluateInjuryCategoryPrecheck(input({ rules }));

    expect(result.kind).toBe(expectedKind);
    expect(result.ready).toBe(false);
    expect(result.humanReviewRequired).toBe(true);
  });

  it.each([
    [
      'missing medical document consent',
      { medicalDocumentConsentRecorded: false },
      'privacy_consent_missing',
    ],
    [
      'missing Article 9 consent',
      { article9ExplicitConsentRecorded: false },
      'article_9_consent_missing',
    ],
  ] as const)('fails closed for %s', (_label, overrides, expectedKind) => {
    const result = evaluateInjuryCategoryPrecheck(input(overrides));

    expect(result.kind).toBe(expectedKind);
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it.each([
    ['medical assessment', { requiresMedicalAssessment: true }],
    ['diagnosis', { requiresDiagnosis: true }],
    ['prognosis', { requiresPrognosis: true }],
    ['treatment advice', { requiresTreatmentAdvice: true }],
    ['invalidity coefficient', { requiresInvalidityCoefficient: true }],
    ['compensation valuation', { requiresCompensationValuation: true }],
    ['insurer liability assessment', { requiresInsurerLiabilityAssessment: true }],
  ] as const)('treats %s requests as out of scope', (_label, overrides) => {
    const result = evaluateInjuryCategoryPrecheck(input(overrides));

    expect(result.kind).toBe('out_of_scope');
    expect(result.outcomeKind).toBe('out_of_scope');
  });

  it('does not lower the 0.80 country-rule confidence floor', () => {
    const result = evaluateInjuryCategoryPrecheck(input({ minimumConfidence: 0.2 }));

    expect(result.minimumConfidence).toBe(0.8);
    expect(result.kind).toBe('ready');
  });

  it('allows a stricter caller confidence floor', () => {
    const result = evaluateInjuryCategoryPrecheck(input({ minimumConfidence: 0.95 }));

    expect(result.minimumConfidence).toBe(0.95);
    expect(result.kind).toBe('low_confidence');
  });

  it('forces AI-assisted packs into human review instead of final decisions', () => {
    const aiProvenance: AssistanceProvenance = {
      source: 'ai_assisted',
      generatedBy: 'domain-assistance',
      ai: {
        aiConfidence: 0.86,
        aiModelVersion: 'synthetic-model-2026-05',
        aiWorkflowName: 'injury-category-synthetic-fixture',
        aiPromptOrSchemaVersion: 'injury-category-v1',
        role: 'classification',
      },
    };

    const pack = createInjuryCategoryPack({
      ...input(),
      packId: 'injury-pack-ai',
      createdAt: '2026-05-18T10:00:00.000Z',
      provenance: aiProvenance,
    });

    expect(pack.outcome.kind).toBe('manual_review_required');
    expect(pack.outcome.reasons.map(reason => reason.code)).toContain('ai_final_decision_blocked');
    expect(pack.requiredHumanReview).toBe(true);
  });
});
