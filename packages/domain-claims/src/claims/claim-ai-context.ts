import {
  mintAICallContext,
  type AICallContext,
  type AICallContextFields,
  type DocumentProcessingPolicy,
} from '@interdomestik/domain-privacy';
import { getResponsesWorkflowConfig } from '@interdomestik/domain-ai/models';

import type { ClaimAiConsentGrant, ClaimAiWorkflow } from './ai-workflow-types';

const CLAIM_DOCUMENT_AI_EXTRACTION_POLICY: DocumentProcessingPolicy = {
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
};

export type ClaimDocumentAiCallContext = AICallContextFields & {
  consentEventId: string;
  consentRecordedAt: string;
};

export function buildClaimDocumentAiCallContext(params: {
  claimId: string;
  documentId: string;
  grant: ClaimAiConsentGrant;
  subjectId?: string;
  tenantId: string;
  userId: string;
  workflow: ClaimAiWorkflow;
}): ClaimDocumentAiCallContext {
  const context = mintClaimDocumentAiCallContext(params);

  return {
    ...context,
    consentEventId: params.grant.consentEventId,
    consentRecordedAt: params.grant.recordedAt,
  };
}

export function mintClaimDocumentAiCallContext(params: {
  claimId: string;
  documentId: string;
  grant: ClaimAiConsentGrant;
  subjectId?: string;
  tenantId: string;
  userId: string;
  workflow: ClaimAiWorkflow;
}): AICallContext {
  const config = getResponsesWorkflowConfig(params.workflow);
  const subjectId = params.subjectId ?? params.userId;

  const decision = mintAICallContext({
    workflowId: params.workflow,
    owner: 'domain-claims',
    tenantId: params.tenantId,
    actorId: params.userId,
    subjectId,
    scope: {
      claimId: params.claimId,
      documentId: params.documentId,
    },
    purpose: 'document_extraction',
    processingPurpose: 'ai_document_extraction',
    retention: 'zero_retention_no_training',
    posture: 'human_review_required',
    consent: 'required_granted',
    invalidityPosture: 'not_applicable',
    consentEvidence: {
      documentPolicy: CLAIM_DOCUMENT_AI_EXTRACTION_POLICY,
      modelBoundary: config.model,
      promptOrSchemaVersion: config.promptVersion,
      requestedPurpose: 'ai_document_extraction',
      consentEvents: [
        {
          id: params.grant.consentEventId,
          tenantId: params.tenantId,
          actorId: params.userId,
          subjectId,
          scope: { claimId: params.claimId, documentId: params.documentId },
          consentType: 'ai_document_extraction',
          purpose: 'ai_document_extraction',
          documentSensitivity: CLAIM_DOCUMENT_AI_EXTRACTION_POLICY.sensitivity,
          lawfulBasis: 'consent',
          privacyVersion: 'privacy-v1',
          locale: 'und',
          status: 'accepted',
          recordedAt: params.grant.recordedAt,
          sourceSurface: 'claim-document-ai-consent',
        },
      ],
    },
  });

  if (decision.kind !== 'valid') {
    throw new Error(`Invalid claim document AI context: ${decision.reasons.join(',')}`);
  }

  return decision.context;
}
