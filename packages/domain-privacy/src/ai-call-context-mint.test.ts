import { describe, expect, it } from 'vitest';

import { createDocumentProcessingPolicy } from './documents';
import { mintAICallContext } from './ai-call-context-mint';

describe('mintAICallContext', () => {
  it('returns a typed missing-consent error for consent-gated extraction without evidence', () => {
    const decision = mintAICallContext({
      workflowId: 'claim_intake_extract',
      owner: 'platform-privacy',
      tenantId: 'tenant_1',
      actorId: 'staff_1',
      subjectId: 'member_1',
      scope: { claimId: 'claim_1', documentId: 'document_1' },
      purpose: 'document_extraction',
      processingPurpose: 'ai_document_extraction',
      retention: 'zero_retention_no_training',
      posture: 'human_review_required',
      consent: 'required_granted',
      invalidityPosture: 'not_applicable',
    });

    expect(decision.kind).toBe('missing_consent');
    expect(decision.reasons).toContain('consent_evidence_missing');
  });

  it('mints document extraction context only from consent-backed policy evidence', () => {
    const decision = mintAICallContext({
      workflowId: 'claim_intake_extract',
      owner: 'platform-privacy',
      tenantId: 'tenant_1',
      actorId: 'staff_1',
      subjectId: 'member_1',
      scope: { claimId: 'claim_1', documentId: 'document_1' },
      purpose: 'document_extraction',
      processingPurpose: 'ai_document_extraction',
      retention: 'zero_retention_no_training',
      posture: 'human_review_required',
      consent: 'required_granted',
      invalidityPosture: 'not_applicable',
      consentEvidence: {
        consentEvents: [
          {
            id: 'medical_consent_1',
            tenantId: 'tenant_1',
            actorId: 'staff_1',
            subjectId: 'member_1',
            scope: { claimId: 'claim_1', documentId: 'document_1' },
            consentType: 'medical_document_processing',
            purpose: 'injury_category_precheck',
            documentSensitivity: 'sensitive_health',
            lawfulBasis: 'consent',
            article9Basis: 'explicit_consent',
            privacyVersion: 'privacy-v1',
            locale: 'en',
            status: 'accepted',
            recordedAt: '2026-06-21T00:00:00.000Z',
            sourceSurface: 'member.assistance.upload',
          },
          {
            id: 'ai_consent_1',
            tenantId: 'tenant_1',
            actorId: 'staff_1',
            subjectId: 'member_1',
            scope: { claimId: 'claim_1', documentId: 'document_1' },
            consentType: 'ai_document_extraction',
            purpose: 'ai_document_extraction',
            documentSensitivity: 'sensitive_health',
            lawfulBasis: 'consent',
            article9Basis: 'explicit_consent',
            privacyVersion: 'privacy-v1',
            locale: 'en',
            status: 'accepted',
            recordedAt: '2026-06-21T00:01:00.000Z',
            sourceSurface: 'member.assistance.upload',
          },
        ],
        documentPolicy: createDocumentProcessingPolicy({
          sensitivity: 'sensitive_health',
          sourceUploadSurface: 'member.assistance.upload',
        }),
        modelBoundary: 'zero-retention-vendor',
        promptOrSchemaVersion: 'claim-intake-v1',
        requestedPurpose: 'injury_category_precheck',
      },
    });

    expect(decision.kind).toBe('valid');
  });

  it('rejects consent evidence that does not match the full privacy scope', () => {
    const decision = mintAICallContext({
      workflowId: 'claim_intake_extract',
      owner: 'platform-privacy',
      tenantId: 'tenant_1',
      actorId: 'staff_1',
      subjectId: 'member_1',
      scope: { caseId: 'case_1', claimId: 'claim_1', documentId: 'document_1' },
      purpose: 'document_extraction',
      processingPurpose: 'ai_document_extraction',
      retention: 'zero_retention_no_training',
      posture: 'human_review_required',
      consent: 'required_granted',
      invalidityPosture: 'not_applicable',
      consentEvidence: {
        consentEvents: [
          {
            id: 'ai_consent_1',
            tenantId: 'tenant_1',
            actorId: 'staff_1',
            subjectId: 'member_1',
            scope: { caseId: 'case_2', claimId: 'claim_1', documentId: 'document_1' },
            consentType: 'ai_document_extraction',
            purpose: 'ai_document_extraction',
            lawfulBasis: 'consent',
            privacyVersion: 'privacy-v1',
            locale: 'en',
            status: 'accepted',
            recordedAt: '2026-06-21T00:01:00.000Z',
            sourceSurface: 'member.assistance.upload',
          },
        ],
        documentPolicy: createDocumentProcessingPolicy({
          sensitivity: 'personal',
          sourceUploadSurface: 'member.assistance.upload',
        }),
        modelBoundary: 'zero-retention-vendor',
        promptOrSchemaVersion: 'claim-intake-v1',
      },
    });

    expect(decision.kind).toBe('missing_consent');
    expect(decision.reasons).toContain('consent_evidence_missing');
  });
});
