import type { AICallContextFields } from './ai';
import { mintAICallContext, type AICallContextMintInput } from './ai-call-context-mint';
import { createDocumentProcessingPolicy } from './documents';

export function mintRequired(input: AICallContextMintInput) {
  const decision = mintAICallContext(input);
  if (decision.kind !== 'valid') throw new Error(decision.reasons.join(','));
  return decision.context;
}

export function withAcceptedConsent(input: AICallContextFields): AICallContextMintInput {
  return {
    ...input,
    consentEvidence: {
      consentEvents: [
        {
          id: 'consent_1',
          tenantId: input.tenantId,
          actorId: input.actorId,
          subjectId: input.subjectId ?? input.actorId,
          scope: input.scope,
          consentType: 'ai_document_extraction',
          purpose: input.processingPurpose,
          lawfulBasis: 'consent',
          privacyVersion: 'privacy-v1',
          locale: 'en',
          status: 'accepted',
          recordedAt: '2026-06-21T00:00:00.000Z',
          sourceSurface: 'domain-privacy-test',
        },
      ],
    },
  };
}

export function createDocumentExtractionMintInput(
  overrides: {
    aiConsentSourceSurface?: string;
    documentPolicySourceSurface?: string;
    medicalConsentSourceSurface?: string;
  } = {}
): AICallContextMintInput {
  const sourceSurface = overrides.documentPolicySourceSurface ?? 'member.assistance.upload';
  const aiConsentSourceSurface = overrides.aiConsentSourceSurface ?? sourceSurface;
  const medicalConsentSourceSurface = overrides.medicalConsentSourceSurface ?? sourceSurface;

  return {
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
          sourceSurface: medicalConsentSourceSurface,
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
          sourceSurface: aiConsentSourceSurface,
        },
      ],
      documentPolicy: createDocumentProcessingPolicy({
        sensitivity: 'sensitive_health',
        sourceUploadSurface: sourceSurface,
      }),
      modelBoundary: 'zero-retention-vendor',
      promptOrSchemaVersion: 'claim-intake-v1',
      requestedPurpose: 'injury_category_precheck',
    },
  };
}
