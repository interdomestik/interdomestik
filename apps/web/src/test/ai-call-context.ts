import {
  mintAICallContext,
  type AICallContext,
  type AICallContextMintInput,
} from '../../../../packages/domain-privacy/src';

export const claimIntakeAiCallContext = createLegalAiCallContext('doc-1', 'claim_intake_extract');

export function createLegalAiCallContext(
  documentId: string,
  workflowId = 'legal_doc_extract'
): AICallContext {
  return mustMintAiContext({
    workflowId,
    owner: 'domain-claims',
    tenantId: 'tenant-1',
    actorId: 'user-1',
    subjectId: 'member-1',
    scope: { claimId: 'claim-1', documentId },
    purpose: 'document_extraction',
    processingPurpose: 'ai_document_extraction',
    retention: 'zero_retention_no_training',
    posture: 'human_review_required',
    consent: 'required_granted',
    invalidityPosture: 'not_applicable',
    consentEvidence: {
      consentEvents: [
        {
          id: 'consent-1',
          tenantId: 'tenant-1',
          actorId: 'user-1',
          subjectId: 'member-1',
          scope: { claimId: 'claim-1', documentId },
          consentType: 'ai_document_extraction',
          purpose: 'ai_document_extraction',
          documentSensitivity: 'personal',
          lawfulBasis: 'consent',
          privacyVersion: 'privacy-v1',
          locale: 'en',
          status: 'accepted',
          recordedAt: '2026-06-21T10:00:00.000Z',
          sourceSurface: 'claim-document-ai-consent',
        },
      ],
      documentPolicy: {
        sensitivity: 'personal',
        sourceUploadSurface: 'claim-document-ai-consent',
        allowedPurposes: ['ai_document_extraction'],
        allowedRecipientClasses: ['interdomestik_internal'],
        requiredConsentTypes: ['ai_document_extraction'],
        retentionPolicyKey: 'case_document_ai_extraction_zero_retention',
        requiresHumanReview: true,
        aiExtractionAllowed: true,
        redactionRequired: false,
        accessPolicyId: 'claim.document.ai_extraction.v1',
      },
      modelBoundary: 'test-model',
      promptOrSchemaVersion: 'test-schema-v1',
      requestedPurpose: 'ai_document_extraction',
    },
  });
}

function mustMintAiContext(input: AICallContextMintInput): AICallContext {
  const decision = mintAICallContext(input);
  if (decision.kind !== 'valid') {
    throw new Error(`Test AI context minting failed: ${decision.reasons.join(',')}`);
  }
  return decision.context;
}
