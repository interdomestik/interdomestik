import { describe, expect, it } from 'vitest';
import type { AssistanceProvenance } from '../types';
import {
  VEHICLE_DAMAGE_PRIVACY_ALIGNMENT,
  VEHICLE_DAMAGE_REQUIRED_DISCLAIMERS,
  createVehicleDamagePack,
  evaluateVehicleDamagePrecheck,
  type VehicleDamageReadinessInput,
  type VehicleDamageRuleInput,
} from './vehicle-damage';

const NOW = new Date('2026-05-19T09:00:00.000Z');

const BASE_METADATA = {
  country: 'DE',
  sourceReference: 'synthetic-vehicle-rule/de/2026-01',
  owner: 'product-legal-review',
  lastReviewed: '2026-05-01',
  confidence: 0.92,
};

const BASE_EVIDENCE = {
  kind: 'document_reference' as const,
  referenceId: 'synthetic-vehicle-damage-photo-ref',
  summaryKey: 'synthetic_vehicle_damage_panel_reference',
  sourceReference: 'synthetic-vehicle-evidence/de/2026-01',
  lastReviewed: '2026-05-01',
  confidence: 0.9,
};

function rule(overrides: Partial<VehicleDamageRuleInput> = {}): VehicleDamageRuleInput {
  return {
    country: 'DE',
    scenario: 'traffic_collision_damage',
    participantRole: 'member_driver',
    ruleFamily: 'vehicle_damage_precheck',
    metadata: BASE_METADATA,
    damageCategoryCodes: ['panel_damage_reported', 'drivability_compromised'],
    inspectionReadinessMarkers: ['damage_photo_reference_present', 'inspection_reference_needed'],
    repairAssessmentRoutingMarkers: ['repair_assessment_review', 'insurer_review_required'],
    evidenceReferences: [BASE_EVIDENCE],
    documentSensitivityClass: 'personal',
    ...overrides,
  };
}

function input(overrides: Partial<VehicleDamageReadinessInput> = {}): VehicleDamageReadinessInput {
  return {
    zone: 'member',
    applicableJurisdictionCountry: 'de',
    incidentCountry: 'de',
    vehicleRegistrationCountry: 'de',
    insurerCountry: 'de',
    driverResidenceCountry: 'de',
    scenario: 'traffic_collision_damage',
    participantRole: 'member_driver',
    requestedRuleFamily: 'vehicle_damage_precheck',
    rules: [rule()],
    now: NOW,
    documentProcessingConsentRecorded: true,
    ...overrides,
  };
}

describe('evaluateVehicleDamagePrecheck', () => {
  it('returns a supported member-zone vehicle damage pre-check with privacy alignment', () => {
    const result = evaluateVehicleDamagePrecheck(input());

    expect(result).toMatchObject({
      kind: 'ready',
      ready: true,
      outcomeKind: 'eligible',
      humanReviewRequired: false,
      applicableJurisdictionCountry: 'DE',
      incidentCountry: 'DE',
      damageCategoryCodes: ['panel_damage_reported', 'drivability_compromised'],
      inspectionReadinessMarkers: ['damage_photo_reference_present', 'inspection_reference_needed'],
      repairAssessmentRoutingMarkers: ['repair_assessment_review', 'insurer_review_required'],
      privacyAlignment: VEHICLE_DAMAGE_PRIVACY_ALIGNMENT,
      documentSensitivityClass: 'personal',
      piiClassification: 'incident_sensitive',
    });
    expect(result.minimumConfidence).toBe(0.8);
    expect(result.requiredDisclaimers).toEqual(VEHICLE_DAMAGE_REQUIRED_DISCLAIMERS);
    expect(result.requiredDisclaimers).toEqual(
      expect.arrayContaining(['not_medical_advice', 'not_professional_opinion', 'educational_only'])
    );
    expect(result.evidenceReferences).toEqual([BASE_EVIDENCE]);
  });

  it('creates a member vehicle damage pack without raw plate, VIN, or narrative fields', () => {
    const pack = createVehicleDamagePack({
      ...input(),
      packId: 'vehicle-damage-pack-1',
      createdAt: '2026-05-19T09:00:00.000Z',
    });

    expect(pack.packType).toBe('vehicle_damage');
    expect(pack.zone).toBe('member');
    expect(pack.outcome.piiClassification).toBe('incident_sensitive');
    expect(pack.retentionPolicyKey).toBe('member_assistance_vehicle_damage_v1');
    expect(pack.privacyAlignment.documentProcessingConsentType).toBe('document_upload_processing');
    expect(pack.privacyAlignment.insurerSharingConsentType).toBe('share_with_insurer');
    expect(pack.privacyAlignment.bureauSharingConsentType).toBe('share_with_bureau');
    expect(pack.documentSensitivityClass).toBe('personal');
    expect(pack.evidenceReferences[0]?.summaryKey).toBe('synthetic_vehicle_damage_panel_reference');
    expect(JSON.stringify(pack)).not.toContain('plate');
    expect(JSON.stringify(pack)).not.toContain('VIN');
    expect(JSON.stringify(pack)).not.toContain('real incident');
  });

  it('uses legal-professional-recovery sensitivity for insurer or bureau-adjacent evidence', () => {
    const pack = createVehicleDamagePack({
      ...input({
        rules: [rule({ documentSensitivityClass: 'legal_professional_recovery' })],
      }),
      packId: 'vehicle-damage-pack-legal-ref',
      createdAt: '2026-05-19T09:00:00.000Z',
    });

    expect(pack.documentSensitivityClass).toBe('legal_professional_recovery');
    expect(pack.privacyAlignment.legalDocumentSensitivity).toBe('legal_professional_recovery');
  });

  it('requires member zone for vehicle damage pre-checks', () => {
    const result = evaluateVehicleDamagePrecheck(input({ zone: 'free' }));

    expect(result.kind).toBe('requires_member_zone');
    expect(result.outcomeKind).toBe('requires_member_zone');
    expect(result.humanReviewRequired).toBe(true);
  });

  it('keeps Professional Recovery-like inputs out of vehicle pre-check decisions', () => {
    const result = evaluateVehicleDamagePrecheck(input({ requiresProfessionalRecovery: true }));

    expect(result.kind).toBe('requires_professional_recovery');
    expect(result.outcomeKind).toBe('requires_professional_recovery');
  });

  it.each([
    ['missing jurisdiction', { applicableJurisdictionCountry: '' }, 'missing_jurisdiction'],
    ['unsupported scenario', { scenario: 'rental_deposit_dispute' }, 'unsupported_scenario'],
    ['unsupported role', { participantRole: 'counterparty_driver' }, 'unsupported_role'],
    ['unsupported family', { requestedRuleFamily: 'green_card' }, 'unsupported_rule_family'],
  ] as const)('fails closed for %s', (_label, overrides, expectedKind) => {
    const result = evaluateVehicleDamagePrecheck(input(overrides));

    expect(result.kind).toBe(expectedKind);
    expect(result.ready).toBe(false);
    expect(result.humanReviewRequired).toBe(true);
  });

  it.each([
    ['incident country divergence', { applicableJurisdictionCountry: 'DE', incidentCountry: 'IT' }],
    [
      'registration country divergence',
      { applicableJurisdictionCountry: 'DE', vehicleRegistrationCountry: 'IT' },
    ],
    ['insurer country divergence', { applicableJurisdictionCountry: 'DE', insurerCountry: 'IT' }],
  ] as const)('requires a deterministic tie-breaker for %s', (_label, overrides) => {
    const result = evaluateVehicleDamagePrecheck(input(overrides));

    expect(result.kind).toBe('jurisdiction_tie_breaker_missing');
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it('supports cross-border input when the jurisdiction tie-breaker is explicit', () => {
    const result = evaluateVehicleDamagePrecheck(
      input({
        applicableJurisdictionCountry: 'DE',
        incidentCountry: 'IT',
        vehicleRegistrationCountry: 'DE',
        insurerCountry: 'AT',
        jurisdictionTieBreakerReason: 'policy_rules_apply_de_jurisdiction',
      })
    );

    expect(result.kind).toBe('ready');
    expect(result.incidentCountry).toBe('IT');
    expect(result.insurerCountry).toBe('AT');
    expect(result.applicableJurisdictionCountry).toBe('DE');
  });

  it.each([
    ['missing rule', [], 'missing_rule'],
    ['metadata incomplete', [rule({ metadata: { country: 'DE' } })], 'metadata_incomplete'],
    ['stale rule', [rule({ metadata: { ...BASE_METADATA, lastReviewed: '2024-01-01' } })], 'stale'],
    ['conflicting rules', [rule(), rule({ damageCategoryCodes: ['glass_only'] })], 'conflicting'],
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
      'unsupported damage category',
      [rule({ damageCategoryCodes: ['external_repair_schedule_code'] })],
      'unsupported_damage_category',
    ],
    ['missing damage category', [rule({ damageCategoryCodes: [] })], 'unsupported_damage_category'],
    [
      'unsupported inspection marker',
      [rule({ inspectionReadinessMarkers: ['raw_photo_required'] })],
      'unsupported_inspection_marker',
    ],
    [
      'unsupported routing marker',
      [rule({ repairAssessmentRoutingMarkers: ['final_total_loss_decision'] })],
      'unsupported_routing_marker',
    ],
  ] as const)('fails closed for %s', (_label, rules, expectedKind) => {
    const result = evaluateVehicleDamagePrecheck(input({ rules }));

    expect(result.kind).toBe(expectedKind);
    expect(result.ready).toBe(false);
    expect(result.humanReviewRequired).toBe(true);
  });

  it('fails closed when evidence type is unsupported by the applicable rule', () => {
    const result = evaluateVehicleDamagePrecheck(
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
      'missing document-processing consent',
      { documentProcessingConsentRecorded: false },
      'document_processing_consent_missing',
    ],
    [
      'missing insurer-sharing consent',
      { insurerSharingRequested: true, insurerSharingConsentRecorded: false },
      'insurer_sharing_consent_missing',
    ],
    [
      'missing bureau-sharing consent',
      { bureauSharingRequested: true, bureauSharingConsentRecorded: false },
      'bureau_sharing_consent_missing',
    ],
    [
      'missing AI-extraction consent',
      { aiExtractionRequested: true, aiExtractionConsentRecorded: false },
      'ai_extraction_consent_missing',
    ],
  ] as const)('fails closed for %s', (_label, overrides, expectedKind) => {
    const result = evaluateVehicleDamagePrecheck(input(overrides));

    expect(result.kind).toBe(expectedKind);
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it('does not infer bureau-sharing consent from insurer-sharing consent', () => {
    const result = evaluateVehicleDamagePrecheck(
      input({
        bureauSharingRequested: true,
        insurerSharingRequested: true,
        insurerSharingConsentRecorded: true,
      })
    );

    expect(result.kind).toBe('bureau_sharing_consent_missing');
  });

  it('routes health facts to injury review without returning a split vehicle pack', () => {
    const result = evaluateVehicleDamagePrecheck(input({ healthEvidenceDetected: true }));

    expect(result.kind).toBe('health_evidence_requires_injury_review');
    expect(result.outcomeKind).toBe('manual_review_required');
    expect(result.reasons.map(reason => reason.code)).toContain(
      'health_evidence_requires_injury_review'
    );
    expect(result.damageCategoryCodes).toEqual([]);
  });

  it.each([
    ['plate OCR', { requiresPlateOcr: true }],
    ['VIN OCR', { requiresVinOcr: true }],
  ] as const)('blocks %s from model-call surfaces', (_label, overrides) => {
    const result = evaluateVehicleDamagePrecheck(input(overrides));

    expect(result.kind).toBe('plate_or_vin_ocr_blocked');
    expect(result.outcomeKind).toBe('manual_review_required');
  });

  it.each([
    ['repair-cost valuation', { requiresRepairCostValuation: true }],
    ['diminished-value valuation', { requiresDiminishedValueValuation: true }],
    ['liability assessment', { requiresLiabilityAssessment: true }],
    ['insurer coverage decision', { requiresInsurerCoverageDecision: true }],
    ['fraud determination', { requiresFraudDetermination: true }],
    ['settlement strategy', { requiresSettlementStrategy: true }],
    ['legal advice', { requiresLegalAdvice: true }],
  ] as const)('treats %s requests as out of scope', (_label, overrides) => {
    const result = evaluateVehicleDamagePrecheck(input(overrides));

    expect(result.kind).toBe('out_of_scope');
    expect(result.outcomeKind).toBe('out_of_scope');
  });

  it('does not lower the 0.80 country-rule confidence floor', () => {
    const result = evaluateVehicleDamagePrecheck(input({ minimumConfidence: 0.2 }));

    expect(result.minimumConfidence).toBe(0.8);
    expect(result.kind).toBe('ready');
  });

  it('allows a stricter caller confidence floor', () => {
    const result = evaluateVehicleDamagePrecheck(input({ minimumConfidence: 0.95 }));

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
        aiWorkflowName: 'vehicle-damage-synthetic-fixture',
        aiPromptOrSchemaVersion: 'vehicle-damage-v1',
        role: 'classification',
      },
    };

    const pack = createVehicleDamagePack({
      ...input({ aiExtractionRequested: true, aiExtractionConsentRecorded: true }),
      packId: 'vehicle-damage-pack-ai',
      createdAt: '2026-05-19T09:00:00.000Z',
      provenance: aiProvenance,
    });

    expect(pack.outcome.kind).toBe('manual_review_required');
    expect(pack.outcome.reasons.map(reason => reason.code)).toContain('ai_final_decision_blocked');
    expect(pack.requiredHumanReview).toBe(true);
  });
});
