import type { DomainAiCallContext } from '../context';

export function createDocumentExtractionAiContext(
  workflowId = 'claim_intake_extract'
): DomainAiCallContext {
  return {
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
  };
}

export function createGeneralAiContext(workflowId = 'claim_summary'): DomainAiCallContext {
  return {
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
  };
}
