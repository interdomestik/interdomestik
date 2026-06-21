import { describe, expect, it } from 'vitest';

import { mintAICallContext } from './ai-call-context-mint';

describe('AI call context consent source hardening', () => {
  it('rejects generic Terms/Privacy consent as AI extraction evidence', () => {
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
            id: 'generic_terms_privacy_1',
            tenantId: 'tenant_1',
            actorId: 'staff_1',
            subjectId: 'member_1',
            scope: { claimId: 'claim_1', documentId: 'document_1' },
            consentType: 'ai_document_extraction',
            purpose: 'ai_document_extraction',
            lawfulBasis: 'consent',
            privacyVersion: 'privacy-v1',
            locale: 'en',
            status: 'accepted',
            recordedAt: '2026-06-21T00:01:00.000Z',
            sourceSurface: 'terms-and-privacy',
          },
        ],
        documentPolicy: {
          sensitivity: 'personal',
          sourceUploadSurface: 'terms-and-privacy',
          allowedPurposes: ['ai_document_extraction'],
          allowedRecipientClasses: ['interdomestik_internal'],
          requiredConsentTypes: ['ai_document_extraction'],
          retentionPolicyKey: 'case_document_ai_extraction_zero_retention',
          requiresHumanReview: true,
          aiExtractionAllowed: true,
          redactionRequired: false,
          accessPolicyId: 'claim.document.ai_extraction.v1',
        },
        modelBoundary: 'zero-retention-vendor',
        promptOrSchemaVersion: 'claim-intake-v1',
        requestedPurpose: 'ai_document_extraction',
      },
    });

    expect(decision.kind).toBe('missing_consent');
    expect(decision.reasons).toContain('consent_evidence_missing');
  });
});
