export const claimIntakeAiCallContext = {
  workflowId: 'claim_intake_extract',
  owner: 'domain-claims',
  tenantId: 'tenant-1',
  actorId: 'user-1',
  subjectId: 'user-1',
  scope: { claimId: 'claim-1', documentId: 'doc-1' },
  purpose: 'document_extraction',
  processingPurpose: 'ai_document_extraction',
  retention: 'zero_retention_no_training',
  posture: 'human_review_required',
  consent: 'required_granted',
  invalidityPosture: 'not_applicable',
  consentEventId: 'consent-1',
  consentRecordedAt: '2026-06-21T10:00:00.000Z',
};

export function createLegalAiCallContext(documentId: string) {
  return {
    ...claimIntakeAiCallContext,
    workflowId: 'legal_doc_extract',
    scope: { claimId: 'claim-1', documentId },
  };
}
