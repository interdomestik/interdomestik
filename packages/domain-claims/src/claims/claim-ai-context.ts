import { validateAICallContext, type AICallContext } from '@interdomestik/domain-privacy';

import type { ClaimAiConsentGrant, ClaimAiWorkflow } from './ai-workflow-types';

export type ClaimDocumentAiCallContext = AICallContext & {
  consentEventId: string;
  consentRecordedAt: string;
};

export function buildClaimDocumentAiCallContext(params: {
  claimId: string;
  documentId: string;
  grant: ClaimAiConsentGrant;
  tenantId: string;
  userId: string;
  workflow: ClaimAiWorkflow;
}): ClaimDocumentAiCallContext {
  const context = {
    workflowId: params.workflow,
    owner: 'domain-claims',
    tenantId: params.tenantId,
    actorId: params.userId,
    subjectId: params.userId,
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
  } as const;
  const decision = validateAICallContext(context);

  if (decision.kind === 'invalid') {
    throw new Error(`Invalid claim document AI context: ${decision.reasons.join(',')}`);
  }

  return {
    ...decision.context,
    consentEventId: params.grant.consentEventId,
    consentRecordedAt: params.grant.recordedAt,
  };
}
