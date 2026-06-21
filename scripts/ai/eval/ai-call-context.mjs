function safeId(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80) : fallback;
}

function createGeneralCaseContext(workflowId) {
  return {
    workflowId,
    owner: 'ai-fixture-eval',
    tenantId: 'eval-tenant',
    actorId: 'ai-eval-runner',
    scope: { caseId: `${workflowId}-fixture` },
    purpose: 'general_case',
    processingPurpose: 'staff_triage',
    retention: 'transient_no_training',
    posture: 'advisory',
    consent: 'not_required',
    invalidityPosture: 'not_applicable',
  };
}

function createDocumentExtractionContext(workflowId, input) {
  const documentId = safeId(input?.fileName, 'document-fixture');

  return {
    workflowId,
    owner: 'ai-fixture-eval',
    tenantId: 'eval-tenant',
    actorId: 'ai-eval-runner',
    subjectId: 'eval-subject',
    scope: {
      caseId: `${workflowId}-fixture`,
      documentId,
    },
    purpose: 'document_extraction',
    processingPurpose: 'ai_document_extraction',
    retention: 'zero_retention_no_training',
    posture: 'human_review_required',
    consent: 'required_granted',
    invalidityPosture: 'not_applicable',
  };
}

export function createEvalAiCallContext(workflowId, input) {
  if (workflowId === 'legal_doc_extract') {
    return createDocumentExtractionContext(workflowId, input);
  }

  return createGeneralCaseContext(workflowId);
}

export function createEvalWorkflowRunners(deps) {
  return {
    policy_extract: {
      execute: async input => deps.analyzePolicyText(String(input.documentText ?? '')),
      normalizeForSchema: value => value,
      schema: deps.policyExtractSchema,
    },
    claim_summary: {
      execute: async input =>
        deps.summarizeClaim({
          ...input,
          aiCallContext: createEvalAiCallContext('claim_summary', input),
        }),
      normalizeForSchema: value => value,
      schema: deps.claimSummarySchema,
    },
    legal_doc_extract: {
      execute: async input =>
        deps.extractLegalDocument({
          ...input,
          aiCallContext: createEvalAiCallContext('legal_doc_extract', input),
        }),
      normalizeForSchema: value => value,
      schema: deps.legalDocExtractSchema,
    },
  };
}
