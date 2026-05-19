import { describe, expect, it } from 'vitest';
import type { AssistanceProvenance } from '../types';
import {
  INVALIDITY_REVIEW_PRIVACY_ALIGNMENT,
  INVALIDITY_REVIEW_REQUIRED_DISCLAIMERS,
  createInvalidityReviewPack,
  evaluateInvalidityReview,
  type InvalidityPrerequisiteReferenceInput,
  type InvalidityReviewReadinessInput,
  type InvalidityReviewRuleInput,
} from './invalidity-review';

const NOW = new Date('2026-05-19T12:00:00.000Z');

const BASE_METADATA = {
  country: 'DE',
  sourceReference: 'synthetic-invalidity-rule/de/2026-01',
  owner: 'product-legal-review',
  lastReviewed: '2026-05-01',
  confidence: 0.93,
};

const BASE_EVIDENCE = {
  kind: 'document_reference' as const,
  referenceId: 'synthetic-invalidity-medical-reference',
  summaryKey: 'synthetic_invalidity_review_functional_limit_reference',
  sourceReference: 'synthetic-invalidity-evidence/de/2026-01',
  lastReviewed: '2026-05-01',
  confidence: 0.91,
  documentSensitivityClass: 'sensitive_health' as const,
  processingPurpose: 'invalidity_review' as const,
};

const INJURY_PREREQUISITE = {
  packType: 'injury_category',
  packId: 'synthetic-injury-pack-1',
  referenceId: 'synthetic-injury-category-reference',
  statusCode: 'injury_category_reference_present',
  sourceReference: 'synthetic-injury-pack/de/2026-01',
  lastReviewed: '2026-05-01',
  confidence: 0.9,
} as const satisfies InvalidityPrerequisiteReferenceInput;

const VEHICLE_PREREQUISITE = {
  packType: 'vehicle_damage',
  packId: 'synthetic-vehicle-damage-pack-1',
  referenceId: 'synthetic-vehicle-damage-reference',
  statusCode: 'vehicle_damage_reference_present',
  sourceReference: 'synthetic-vehicle-pack/de/2026-01',
  lastReviewed: '2026-05-01',
  confidence: 0.9,
} as const satisfies InvalidityPrerequisiteReferenceInput;

function rule(overrides: Partial<InvalidityReviewRuleInput> = {}): InvalidityReviewRuleInput {
  return {
    country: 'DE',
    scenario: 'traffic_injury_invalidity',
    participantRole: 'member_driver',
    ruleFamily: 'invalidity_review',
    metadata: BASE_METADATA,
    reviewReasonCodes: [
      'injury_category_review_required',
      'functional_limitation_review_required',
      'vehicle_context_review_required',
    ],
    prerequisiteStatusCodes: [
      'injury_category_reference_present',
      'vehicle_damage_reference_present',
      'medical_document_reference_present',
    ],
    evidenceReferences: [BASE_EVIDENCE],
    documentSensitivityClass: 'sensitive_health',
    ...overrides,
  };
}

function input(
  overrides: Partial<InvalidityReviewReadinessInput> = {}
): InvalidityReviewReadinessInput {
  return {
    zone: 'member',
    applicableJurisdictionCountry: 'de',
    incidentCountry: 'de',
    memberResidenceCountry: 'de',
    treatmentCountry: 'de',
    vehicleRegistrationCountry: 'de',
    insurerCountry: 'de',
    scenario: 'traffic_injury_invalidity',
    participantRole: 'member_driver',
    requestedRuleFamily: 'invalidity_review',
    prerequisiteReferences: [INJURY_PREREQUISITE, VEHICLE_PREREQUISITE],
    rules: [rule()],
    now: NOW,
    medicalDocumentConsentRecorded: true,
    article9ExplicitConsentRecorded: true,
    documentProcessingConsentRecorded: true,
    ...overrides,
  };
}

describe('evaluateInvalidityReview', () => {
  it('returns a member-zone invalidity review artifact for human review only', () => {
    const result = evaluateInvalidityReview(input());

    expect(result).toMatchObject({
      kind: 'ready',
      ready: true,
      outcomeKind: 'manual_review_required',
      humanReviewRequired: true,
      applicableJurisdictionCountry: 'DE',
      incidentCountry: 'DE',
      reviewRequiredReasonCodes: [
        'injury_category_review_required',
        'functional_limitation_review_required',
        'vehicle_context_review_required',
      ],
      prerequisiteStatusCodes: [
        'injury_category_reference_present',
        'vehicle_damage_reference_present',
        'medical_document_reference_present',
      ],
      privacyAlignment: INVALIDITY_REVIEW_PRIVACY_ALIGNMENT,
      documentSensitivityClass: 'sensitive_health',
      piiClassification: 'medical_sensitive',
    });
    expect(result.minimumConfidence).toBe(0.8);
    expect(result.requiredDisclaimers).toEqual(INVALIDITY_REVIEW_REQUIRED_DISCLAIMERS);
    expect(result.requiredDisclaimers).toContain('educational_only');
    expect(result.evidenceReferences).toEqual([BASE_EVIDENCE]);
  });

  it('creates a member invalidity review pack without raw medical, vehicle, or legal narrative fields', () => {
    const pack = createInvalidityReviewPack({
      ...input(),
      packId: 'invalidity-review-pack-1',
      createdAt: '2026-05-19T12:00:00.000Z',
    });

    expect(pack.packType).toBe('invalidity_review');
    expect(pack.zone).toBe('member');
    expect(pack.requiredHumanReview).toBe(true);
    expect(pack.outcome.kind).toBe('manual_review_required');
    expect(pack.outcome.piiClassification).toBe('medical_sensitive');
    expect(pack.retentionPolicyKey).toBe('member_assistance_invalidity_review_v1');
    expect(pack.privacyAlignment.processingPurpose).toBe('invalidity_review');
    expect(pack.documentSensitivityClass).toBe('sensitive_health');
    expect(pack.evidenceReferences[0]?.summaryKey).toBe(
      'synthetic_invalidity_review_functional_limit_reference'
    );
    expect(JSON.stringify(pack)).not.toContain('real patient');
    expect(JSON.stringify(pack)).not.toContain('plate');
    expect(JSON.stringify(pack)).not.toContain('VIN');
    expect(JSON.stringify(pack)).not.toContain('legal strategy');
  });

  it('uses legal-professional-recovery sensitivity for expert, insurer, or legal-adjacent references', () => {
    const pack = createInvalidityReviewPack({
      ...input({
        rules: [rule({ documentSensitivityClass: 'legal_professional_recovery' })],
      }),
      packId: 'invalidity-review-pack-legal-ref',
      createdAt: '2026-05-19T12:00:00.000Z',
    });

    expect(pack.documentSensitivityClass).toBe('legal_professional_recovery');
    expect(pack.privacyAlignment.legalDocumentSensitivity).toBe('legal_professional_recovery');
  });

  it('requires member zone for invalidity review', () => {
    const result = evaluateInvalidityReview(input({ zone: 'free' }));

    expect(result.kind).toBe('requires_member_zone');
    expect(result.outcomeKind).toBe('requires_member_zone');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('keeps Professional Recovery-like inputs out of invalidity review decisions', () => {
    const result = evaluateInvalidityReview(input({ requiresProfessionalRecovery: true }));

    expect(result.kind).toBe('requires_professional_recovery');
    expect(result.outcomeKind).toBe('requires_professional_recovery');
  });

  it.each([
    ['missing jurisdiction', { applicableJurisdictionCountry: '' }, 'missing_jurisdiction'],
    ['unsupported scenario', { scenario: 'property_only_damage' }, 'unsupported_scenario'],
    ['unsupported role', { participantRole: 'counterparty_driver' }, 'unsupported_role'],
    [
      'unsupported family',
      { requestedRuleFamily: 'invalidity_calculation' },
      'unsupported_rule_family',
    ],
  ] as const)('fails closed for %s', (_label, overrides, expectedKind) => {
    const result = evaluateInvalidityReview(input(overrides));

    expect(result.kind).toBe(expectedKind);
    expect(result.ready).toBe(false);
    expect(result.humanReviewRequired).toBe(true);
  });

  it.each([
    ['incident country divergence', { applicableJurisdictionCountry: 'DE', incidentCountry: 'IT' }],
    [
      'treatment country divergence',
      { applicableJurisdictionCountry: 'DE', treatmentCountry: 'IT' },
    ],
    [
      'residence country divergence',
      { applicableJurisdictionCountry: 'DE', memberResidenceCountry: 'AT' },
    ],
    [
      'registration country divergence',
      { applicableJurisdictionCountry: 'DE', vehicleRegistrationCountry: 'IT' },
    ],
    ['insurer country divergence', { applicableJurisdictionCountry: 'DE', insurerCountry: 'AT' }],
  ] as const)('requires a deterministic tie-breaker for %s', (_label, overrides) => {
    const result = evaluateInvalidityReview(input(overrides));

    expect(result.kind).toBe('jurisdiction_tie_breaker_missing');
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it('supports cross-border input when the jurisdiction tie-breaker is explicit', () => {
    const result = evaluateInvalidityReview(
      input({
        applicableJurisdictionCountry: 'DE',
        incidentCountry: 'IT',
        treatmentCountry: 'AT',
        vehicleRegistrationCountry: 'DE',
        jurisdictionTieBreakerReason: 'member_policy_applies_de_invalidity_rules',
      })
    );

    expect(result.kind).toBe('ready');
    expect(result.incidentCountry).toBe('IT');
    expect(result.treatmentCountry).toBe('AT');
    expect(result.applicableJurisdictionCountry).toBe('DE');
  });

  it('does not treat non-applicable country rule differences as conflicts', () => {
    const result = evaluateInvalidityReview(
      input({
        rules: [
          rule(),
          rule({
            country: 'IT',
            metadata: {
              ...BASE_METADATA,
              country: 'IT',
              sourceReference: 'synthetic-invalidity-rule/it/2026-01',
            },
            reviewReasonCodes: ['expert_human_review_required'],
            prerequisiteStatusCodes: ['injury_category_reference_present'],
          }),
        ],
      })
    );

    expect(result.kind).toBe('ready');
    expect(result.countryRuleMetadata).toHaveLength(1);
    expect(result.countryRuleMetadata[0]?.country).toBe('DE');
  });

  it.each([
    ['missing injury prerequisite', [VEHICLE_PREREQUISITE], 'injury_prerequisite_missing'],
    ['missing vehicle prerequisite', [INJURY_PREREQUISITE], 'vehicle_prerequisite_missing'],
    [
      'unsupported prerequisite code',
      [{ ...INJURY_PREREQUISITE, statusCode: 'raw_disability_report_uploaded' }],
      'unsupported_prerequisite_code',
    ],
  ] as const)('fails closed for %s', (_label, prerequisiteReferences, expectedKind) => {
    const result = evaluateInvalidityReview(input({ prerequisiteReferences }));

    expect(result.kind).toBe(expectedKind);
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it('does not require vehicle prerequisites for explicitly non-vehicle invalidity review', () => {
    const result = evaluateInvalidityReview(
      input({
        scenario: 'non_vehicle_injury_invalidity',
        vehicleRegistrationCountry: '',
        insurerCountry: '',
        prerequisiteReferences: [INJURY_PREREQUISITE],
        rules: [
          rule({
            scenario: 'non_vehicle_injury_invalidity',
            reviewReasonCodes: ['injury_category_review_required'],
            prerequisiteStatusCodes: ['injury_category_reference_present'],
          }),
        ],
      })
    );

    expect(result.kind).toBe('ready');
    expect(result.prerequisiteStatusCodes).toEqual(['injury_category_reference_present']);
  });

  it.each([
    ['missing rule', [], 'missing_rule'],
    ['metadata incomplete', [rule({ metadata: { country: 'DE' } })], 'metadata_incomplete'],
    ['stale rule', [rule({ metadata: { ...BASE_METADATA, lastReviewed: '2024-01-01' } })], 'stale'],
    [
      'conflicting rules',
      [rule(), rule({ reviewReasonCodes: ['expert_human_review_required'] })],
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
      'unsupported review reason',
      [rule({ reviewReasonCodes: ['external_disability_rating_code'] })],
      'unsupported_review_reason',
    ],
    ['missing review reason', [rule({ reviewReasonCodes: [] })], 'unsupported_review_reason'],
    [
      'unsupported prerequisite status',
      [rule({ prerequisiteStatusCodes: ['external_disability_report_present'] })],
      'unsupported_prerequisite_code',
    ],
  ] as const)('fails closed for %s', (_label, rules, expectedKind) => {
    const result = evaluateInvalidityReview(input({ rules }));

    expect(result.kind).toBe(expectedKind);
    expect(result.ready).toBe(false);
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when evidence type is unsupported by the applicable rule', () => {
    const result = evaluateInvalidityReview(
      input({
        rules: [
          rule({
            evidenceKindsSupported: ['country_rule'],
          }),
        ],
      })
    );

    expect(result.kind).toBe('unsupported_evidence_type');
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it.each([
    [
      'incomplete prerequisite matrix metadata',
      { prerequisiteMatrixMetadataComplete: false },
      'prerequisite_matrix_incomplete',
    ],
    [
      'missing medical-document consent',
      { medicalDocumentConsentRecorded: false },
      'medical_document_consent_missing',
    ],
    [
      'missing Article 9 posture',
      { article9ExplicitConsentRecorded: false },
      'article_9_consent_missing',
    ],
    [
      'missing document-processing consent for vehicle context',
      { documentProcessingConsentRecorded: false },
      'document_processing_consent_missing',
    ],
    [
      'missing AI-extraction consent',
      { aiExtractionRequested: true, aiExtractionConsentRecorded: false },
      'ai_extraction_consent_missing',
    ],
    [
      'incomplete AI posture',
      { aiExtractionRequested: true, aiExtractionConsentRecorded: true },
      'ai_posture_incomplete',
    ],
  ] as const)('fails closed for %s', (_label, overrides, expectedKind) => {
    const result = evaluateInvalidityReview(input(overrides));

    expect(result.kind).toBe(expectedKind);
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it.each([
    ['medical diagnosis', { requiresMedicalDiagnosis: true }],
    ['prognosis', { requiresPrognosis: true }],
    ['treatment advice', { requiresTreatmentAdvice: true }],
    ['invalidity coefficient calculation', { requiresInvalidityCoefficientCalculation: true }],
    ['compensation valuation', { requiresCompensationValuation: true }],
    ['insurer liability assessment', { requiresInsurerLiabilityAssessment: true }],
    ['insurer coverage decision', { requiresInsurerCoverageDecision: true }],
    ['fraud determination', { requiresFraudDetermination: true }],
    ['settlement strategy', { requiresSettlementStrategy: true }],
    ['legal advice', { requiresLegalAdvice: true }],
  ] as const)('treats %s requests as out of scope', (_label, overrides) => {
    const result = evaluateInvalidityReview(input(overrides));

    expect(result.kind).toBe('out_of_scope');
    expect(result.outcomeKind).toBe('out_of_scope');
  });

  it('does not lower the 0.80 country-rule confidence floor', () => {
    const result = evaluateInvalidityReview(input({ minimumConfidence: 0.2 }));

    expect(result.minimumConfidence).toBe(0.8);
    expect(result.kind).toBe('ready');
  });

  it('allows a stricter caller confidence floor', () => {
    const result = evaluateInvalidityReview(input({ minimumConfidence: 0.95 }));

    expect(result.minimumConfidence).toBe(0.95);
    expect(result.kind).toBe('low_confidence');
  });

  it('keeps AI-assisted invalidity packs non-final and human-review-gated', () => {
    const aiProvenance: AssistanceProvenance = {
      source: 'ai_assisted',
      generatedBy: 'domain-assistance',
      ai: {
        aiConfidence: 0.84,
        aiModelVersion: 'synthetic-model-2026-05',
        aiWorkflowName: 'invalidity-review-synthetic-fixture',
        aiPromptOrSchemaVersion: 'invalidity-review-v1',
        role: 'classification',
      },
    };

    const pack = createInvalidityReviewPack({
      ...input({
        aiExtractionRequested: true,
        aiExtractionConsentRecorded: true,
        aiNoTrainingConfirmed: true,
        aiZeroRetentionConfirmed: true,
        aiNonFinalConfirmed: true,
        aiHumanReviewConfirmed: true,
      }),
      packId: 'invalidity-review-pack-ai',
      createdAt: '2026-05-19T12:00:00.000Z',
      provenance: aiProvenance,
    });

    expect(pack.outcome.kind).toBe('manual_review_required');
    expect(pack.requiredHumanReview).toBe(true);
    expect(pack.outcome.provenance.source).toBe('ai_assisted');
    expect(pack.reviewRequiredReasonCodes).toContain('functional_limitation_review_required');
  });
});
