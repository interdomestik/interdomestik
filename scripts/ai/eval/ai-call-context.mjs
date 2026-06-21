import { mintAICallContext } from '../../../packages/domain-privacy/src/ai-call-context-mint.ts';

function safeId(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80) : fallback;
}

function mintEvalContext(input) {
  const decision = mintAICallContext(input);
  if (decision.kind !== 'valid') {
    throw new Error(`AI eval context rejected: ${decision.reasons.join(',')}`);
  }
  return decision.context;
}

function createGeneralCaseContext(workflowId) {
  return mintEvalContext({
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
  });
}

function createDocumentExtractionContext(workflowId, input) {
  const documentId = safeId(input?.fileName, 'document-fixture');
  const scope = {
    caseId: `${workflowId}-fixture`,
    documentId,
  };
  const subjectId = 'eval-subject';

  return mintEvalContext({
    workflowId,
    owner: 'ai-fixture-eval',
    tenantId: 'eval-tenant',
    actorId: 'ai-eval-runner',
    subjectId,
    scope,
    purpose: 'document_extraction',
    processingPurpose: 'ai_document_extraction',
    retention: 'zero_retention_no_training',
    posture: 'human_review_required',
    consent: 'required_granted',
    invalidityPosture: 'not_applicable',
    consentEvidence: {
      consentEvents: [
        {
          id: 'ai-eval-consent',
          tenantId: 'eval-tenant',
          actorId: 'ai-eval-runner',
          subjectId,
          scope,
          consentType: 'ai_document_extraction',
          purpose: 'ai_document_extraction',
          documentSensitivity: 'personal',
          lawfulBasis: 'consent',
          privacyVersion: 'privacy-v1',
          locale: 'en',
          status: 'accepted',
          recordedAt: '2026-06-21T00:00:00.000Z',
          sourceSurface: 'ai-eval-fixture',
        },
      ],
      documentPolicy: {
        sensitivity: 'personal',
        sourceUploadSurface: 'ai-eval-fixture',
        allowedPurposes: ['ai_document_extraction'],
        allowedRecipientClasses: ['interdomestik_internal'],
        aiExtractionAllowed: true,
        requiresHumanReview: true,
        requiredConsentTypes: ['ai_document_extraction'],
        retentionPolicyKey: 'zero-retention-fixture',
        redactionRequired: false,
        accessPolicyId: 'ai-eval-fixture-policy',
      },
      modelBoundary: 'deterministic-fixture',
      promptOrSchemaVersion: 'ai-eval-fixture-v1',
      requestedPurpose: 'ai_document_extraction',
      noTraining: true,
      zeroRetention: true,
    },
  });
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
