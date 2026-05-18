import { describe, expect, it } from 'vitest';

import {
  PRIVACY_ZONES,
  createDataSubjectRequestContract,
  createDocumentProcessingPolicy,
  evaluateAiExtractionPolicy,
  evaluateConsentRequirement,
  evaluateDocumentAccess,
  isDpiaRequiredForProcessing,
  type ConsentEvent,
} from './index';

const baseConsent: ConsentEvent = {
  id: 'consent_1',
  tenantId: 'tenant_1',
  actorId: 'member_1',
  subjectId: 'member_1',
  scope: {
    claimId: 'claim_1',
    documentId: 'document_1',
  },
  consentType: 'medical_document_processing',
  purpose: 'injury_category_precheck',
  documentSensitivity: 'sensitive_health',
  lawfulBasis: 'consent',
  article9Basis: 'explicit_consent',
  privacyVersion: 'privacy-2026-05',
  locale: 'sq',
  status: 'accepted',
  recordedAt: '2026-05-18T10:00:00.000Z',
  acceptedAt: '2026-05-18T10:00:00.000Z',
  sourceSurface: 'member.assistance.upload',
  ipHash: 'ip_hash_1',
  evidenceSnapshotRef: 'snapshot_1',
};

describe('privacy zones and consent events', () => {
  it('codifies Free, Member, and Professional Recovery privacy zones', () => {
    expect(PRIVACY_ZONES).toEqual([
      'free_self_service',
      'member_assistance',
      'professional_recovery',
    ]);
  });

  it('allows explicit scoped medical consent with Article 9 marker', () => {
    const decision = evaluateConsentRequirement([baseConsent], {
      tenantId: 'tenant_1',
      subjectId: 'member_1',
      consentType: 'medical_document_processing',
      purpose: 'injury_category_precheck',
      documentSensitivity: 'sensitive_health',
      scope: {
        claimId: 'claim_1',
        documentId: 'document_1',
      },
      requiresArticle9Basis: true,
      requiredArticle9Basis: 'explicit_consent',
    });

    expect(decision.kind).toBe('allowed');
    expect(decision.consentEvent?.id).toBe('consent_1');
  });

  it('fails closed when consent is missing, withdrawn, or scoped to another document', () => {
    const missing = evaluateConsentRequirement([], {
      tenantId: 'tenant_1',
      subjectId: 'member_1',
      consentType: 'medical_document_processing',
      purpose: 'injury_category_precheck',
      documentSensitivity: 'sensitive_health',
      scope: { documentId: 'document_1' },
      requiresArticle9Basis: true,
    });

    const withdrawn = evaluateConsentRequirement(
      [
        {
          ...baseConsent,
          id: 'consent_2',
          status: 'withdrawn',
          withdrawnAt: '2026-05-18T11:00:00.000Z',
          recordedAt: '2026-05-18T11:00:00.000Z',
        },
        baseConsent,
      ],
      {
        tenantId: 'tenant_1',
        subjectId: 'member_1',
        consentType: 'medical_document_processing',
        purpose: 'injury_category_precheck',
        documentSensitivity: 'sensitive_health',
        scope: { claimId: 'claim_1', documentId: 'document_1' },
        requiresArticle9Basis: true,
      }
    );

    const wrongScope = evaluateConsentRequirement([baseConsent], {
      tenantId: 'tenant_1',
      subjectId: 'member_1',
      consentType: 'medical_document_processing',
      purpose: 'injury_category_precheck',
      documentSensitivity: 'sensitive_health',
      scope: { documentId: 'document_2' },
      requiresArticle9Basis: true,
    });

    expect(missing.kind).toBe('blocked');
    expect(missing.reasons).toContain('consent_missing');
    expect(withdrawn.kind).toBe('blocked');
    expect(withdrawn.reasons).toContain('consent_withdrawn');
    expect(wrongScope.kind).toBe('blocked');
  });

  it('ignores malformed consent timestamps for latest-event ordering and blocks malformed accepted events', () => {
    const olderAccepted = {
      ...baseConsent,
      id: 'consent_old',
      recordedAt: '2026-05-18T09:00:00.000Z',
    };

    const malformedWithdrawn = {
      ...baseConsent,
      id: 'consent_bad_withdrawn',
      status: 'withdrawn' as const,
      recordedAt: 'not-a-date',
      withdrawnAt: '2026-05-18T11:00:00.000Z',
    };

    const decision = evaluateConsentRequirement([olderAccepted, malformedWithdrawn], {
      tenantId: 'tenant_1',
      subjectId: 'member_1',
      consentType: 'medical_document_processing',
      purpose: 'injury_category_precheck',
      documentSensitivity: 'sensitive_health',
      scope: { claimId: 'claim_1', documentId: 'document_1' },
      requiresArticle9Basis: true,
      requiredArticle9Basis: 'explicit_consent',
    });

    const malformedAccepted = evaluateConsentRequirement([{ ...baseConsent, recordedAt: 'bad' }], {
      tenantId: 'tenant_1',
      subjectId: 'member_1',
      consentType: 'medical_document_processing',
      purpose: 'injury_category_precheck',
      documentSensitivity: 'sensitive_health',
      scope: { claimId: 'claim_1', documentId: 'document_1' },
      requiresArticle9Basis: true,
      requiredArticle9Basis: 'explicit_consent',
    });

    expect(decision.kind).toBe('allowed');
    expect(decision.consentEvent?.id).toBe('consent_old');
    expect(malformedAccepted.kind).toBe('blocked');
    expect(malformedAccepted.reasons).toContain('consent_timestamp_invalid');
  });
});

describe('document classification and role access', () => {
  it('classifies health documents as explicit-consent, human-review, redaction-aware records', () => {
    const policy = createDocumentProcessingPolicy({
      sensitivity: 'sensitive_health',
      sourceUploadSurface: 'member.assistance.upload',
    });

    expect(policy.requiredConsentTypes).toEqual([
      'medical_document_processing',
      'ai_document_extraction',
    ]);
    expect(policy.requiresHumanReview).toBe(true);
    expect(policy.redactionRequired).toBe(true);
    expect(policy.retentionPolicyKey).toBe('sensitive_health_case_document');
    expect(policy.sourceUploadSurface).toBe('member.assistance.upload');
  });

  it('denies agent/promoter access to sensitive documents and requires audit logging', () => {
    const policy = createDocumentProcessingPolicy({
      sensitivity: 'sensitive_health',
      sourceUploadSurface: 'member.assistance.upload',
    });

    const decision = evaluateDocumentAccess({
      role: 'agent_promoter',
      requestedPurpose: 'injury_category_precheck',
      documentPolicy: policy,
    });

    expect(decision.kind).toBe('blocked');
    expect(decision.reasons).toContain('agent_promoter_document_access_denied');
    expect(decision.auditLogRequired).toBe(true);
  });

  it('requires explicit Professional Recovery authorization for legal recovery materials', () => {
    const policy = createDocumentProcessingPolicy({
      sensitivity: 'legal_professional_recovery',
      sourceUploadSurface: 'professional-recovery.authorization',
    });

    const decision = evaluateDocumentAccess({
      role: 'lawyer',
      requestedPurpose: 'lawyer_sharing',
      sharingConsentRecorded: true,
      documentPolicy: policy,
    });

    expect(decision.kind).toBe('blocked');
    expect(decision.reasons).toContain('professional_recovery_authorization_required');
  });
});

describe('AI extraction, DSR, retention, and DPIA posture', () => {
  it('blocks sensitive AI extraction without medical and AI consent', () => {
    const policy = createDocumentProcessingPolicy({
      sensitivity: 'sensitive_health',
      sourceUploadSurface: 'member.assistance.upload',
    });

    const decision = evaluateAiExtractionPolicy({
      tenantId: 'tenant_1',
      subjectId: 'member_1',
      workflow: 'assistance_injury_document_extract',
      modelBoundary: 'zero-retention-vendor',
      noTraining: true,
      zeroRetention: true,
      promptOrSchemaVersion: 'assist-injury-v1',
      requestedPurpose: 'injury_category_precheck',
      scope: { claimId: 'claim_1', documentId: 'document_1' },
      documentPolicy: policy,
      consentEvents: [baseConsent],
    });

    expect(decision.kind).toBe('blocked');
    expect(decision.reasons).toContain('ai_document_extraction_consent_missing');
    expect(decision.finalDecisionAllowed).toBe(false);
    expect(decision.humanReviewRequired).toBe(true);
  });

  it('allows sensitive AI extraction only as non-final and human-review-gated when consented', () => {
    const policy = createDocumentProcessingPolicy({
      sensitivity: 'sensitive_health',
      sourceUploadSurface: 'member.assistance.upload',
    });

    const aiConsent: ConsentEvent = {
      ...baseConsent,
      id: 'consent_ai_1',
      consentType: 'ai_document_extraction',
      purpose: 'ai_document_extraction',
      article9Basis: 'explicit_consent',
      recordedAt: '2026-05-18T10:01:00.000Z',
    };

    const decision = evaluateAiExtractionPolicy({
      tenantId: 'tenant_1',
      subjectId: 'member_1',
      workflow: 'assistance_injury_document_extract',
      modelBoundary: 'zero-retention-vendor',
      noTraining: true,
      zeroRetention: true,
      promptOrSchemaVersion: 'assist-injury-v1',
      requestedPurpose: 'injury_category_precheck',
      scope: { claimId: 'claim_1', documentId: 'document_1' },
      documentPolicy: policy,
      consentEvents: [baseConsent, aiConsent],
    });

    expect(decision.kind).toBe('allowed');
    expect(decision.finalDecisionAllowed).toBe(false);
    expect(decision.humanReviewRequired).toBe(true);
    expect(decision.audit.sensitivity).toBe('sensitive_health');
  });

  it('represents DSR deadlines and DPIA requirement before broad runtime exposure', () => {
    const request = createDataSubjectRequestContract({
      requestType: 'erasure',
      tenantId: 'tenant_1',
      subjectId: 'member_1',
      submittedAt: '2026-05-18T10:00:00.000Z',
      verified: false,
      legalHoldApplies: true,
      reasons: ['claim_legal_hold_requires_review'],
    });

    expect(request.status).toBe('pending_verification');
    expect(request.responseDueAt).toBe('2026-06-17T10:00:00.000Z');
    expect(request.legalHoldApplies).toBe(true);
    expect(
      isDpiaRequiredForProcessing({
        sensitivities: ['sensitive_health'],
        usesAiExtraction: true,
        includesProfessionalRecovery: false,
      })
    ).toBe(true);
  });

  it('rejects malformed DSR submission dates', () => {
    expect(() =>
      createDataSubjectRequestContract({
        requestType: 'access',
        tenantId: 'tenant_1',
        subjectId: 'member_1',
        submittedAt: 'not-a-date',
        verified: true,
      })
    ).toThrow('invalid_submitted_at');
  });
});
