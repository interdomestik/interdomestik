import {
  createDocumentProcessingPolicy,
  mintAICallContext,
  type AICallContextMintInput,
  type ConsentEvent,
} from '@interdomestik/domain-privacy';

import type { DomainAiCallContext } from '../context';

export function createDocumentExtractionAiContext(
  workflowId = 'claim_intake_extract'
): DomainAiCallContext {
  return mustMintAiContext({
    workflowId,
    owner: 'domain-ai-test',
    tenantId: 'tenant-1',
    actorId: 'user-1',
    subjectId: 'user-1',
    scope: { claimId: 'claim-1', documentId: 'document-1' },
    purpose: 'document_extraction',
    processingPurpose: 'ai_document_extraction',
    retention: 'zero_retention_no_training',
    posture: 'human_review_required',
    consent: 'required_granted',
    invalidityPosture: 'not_applicable',
    consentEvidence: {
      consentEvents: [
        createConsentEvent(
          'medical-consent-1',
          'medical_document_processing',
          'injury_category_precheck'
        ),
        createConsentEvent('ai-consent-1', 'ai_document_extraction', 'ai_document_extraction'),
      ],
      documentPolicy: createDocumentProcessingPolicy({
        sensitivity: 'sensitive_health',
        sourceUploadSurface: 'domain-ai-test',
      }),
      modelBoundary: 'zero-retention-test',
      promptOrSchemaVersion: 'test-schema-v1',
      requestedPurpose: 'injury_category_precheck',
    },
  });
}

export function createGeneralAiContext(workflowId = 'claim_summary'): DomainAiCallContext {
  return mustMintAiContext({
    workflowId,
    owner: 'domain-ai-test',
    tenantId: 'tenant-1',
    actorId: 'staff-1',
    scope: { claimId: 'claim-1' },
    purpose: 'general_case',
    processingPurpose: 'staff_triage',
    retention: 'transient_no_training',
    posture: 'advisory',
    consent: 'not_required',
    invalidityPosture: 'not_applicable',
  });
}

function mustMintAiContext(input: AICallContextMintInput): DomainAiCallContext {
  const decision = mintAICallContext(input);
  if (decision.kind !== 'valid') {
    throw new Error(
      `Test AI context minting failed: ${decision.kind}:${decision.reasons.join(',')}`
    );
  }
  return decision.context;
}

function createConsentEvent(
  id: string,
  consentType: ConsentEvent['consentType'],
  purpose: ConsentEvent['purpose']
): ConsentEvent {
  return {
    id,
    tenantId: 'tenant-1',
    actorId: 'user-1',
    subjectId: 'user-1',
    scope: { claimId: 'claim-1', documentId: 'document-1' },
    consentType,
    purpose,
    documentSensitivity: 'sensitive_health',
    lawfulBasis: 'consent',
    article9Basis: 'explicit_consent',
    privacyVersion: 'privacy-v1',
    locale: 'en',
    status: 'accepted',
    recordedAt: '2026-06-21T00:00:00.000Z',
    sourceSurface: 'domain-ai-test',
  };
}
