import { evaluateAiExtractionPolicy } from './ai';
import { isGenericTermsPrivacyConsentSource } from './ai-call-context-consent-source';
import { AI_CALL_CONTEXT_KEYS, PRIVACY_SCOPE_KEYS } from './ai-call-context-keys';
import type {
  AICallContextConsentEvidence,
  AICallContextMintDecision,
  AICallContextMintInput,
} from './ai-call-context-mint-types';
import { buildAICallContext } from './ai-call-context-validation-result';
import {
  collectAICallContextInvalidReasons,
  readPrivacyScope,
} from './ai-call-context-validation-rules';
import { readOwnValue, snapshotOwnValues } from './ai-call-context-own-value';
import type { PrivacyScope } from './types';

export type { AICallContextConsentEvidence, AICallContextMintDecision, AICallContextMintInput };

export function mintAICallContext(input: AICallContextMintInput): AICallContextMintDecision {
  const snapshot = snapshotOwnValues(
    input as unknown as Record<string, unknown>,
    AI_CALL_CONTEXT_KEYS
  );
  const scope = readPrivacyScope(readOwnValue(snapshot, 'scope'));
  const reasons = collectAICallContextInvalidReasons(snapshot, scope);

  if (reasons.length > 0) {
    return { kind: 'invalid', reasons };
  }

  const consentDecision = validateConsentEvidence(input, scope as PrivacyScope);
  if (consentDecision) {
    return consentDecision;
  }

  return {
    kind: 'valid',
    context: buildAICallContext(snapshot, scope as PrivacyScope),
    reasons: [],
  };
}

function validateConsentEvidence(
  input: AICallContextMintInput,
  scope: PrivacyScope
): AICallContextMintDecision | undefined {
  if (input.consent !== 'required_granted') {
    return undefined;
  }

  const evidence = input.consentEvidence;
  if (!evidence || evidence.consentEvents.length === 0) {
    return { kind: 'missing_consent', reasons: ['consent_evidence_missing'] };
  }

  if (!hasAcceptedConsentEvidence(input, evidence)) {
    return { kind: 'missing_consent', reasons: ['consent_evidence_missing'] };
  }

  if (input.purpose !== 'document_extraction') {
    return undefined;
  }

  const policyDecision = validateDocumentExtractionEvidence(input, scope, evidence);
  if (policyDecision.kind === 'allowed') {
    return undefined;
  }

  const missingConsent = policyDecision.reasons.filter(reason =>
    reason.endsWith('_consent_missing')
  );
  return missingConsent.length > 0
    ? { kind: 'missing_consent', reasons: missingConsent }
    : {
        kind: 'invalid',
        reasons: ['document_extraction_policy_blocked', ...policyDecision.reasons],
      };
}

function hasAcceptedConsentEvidence(
  input: AICallContextMintInput,
  evidence: AICallContextConsentEvidence
): boolean {
  return evidence.consentEvents.some(
    event =>
      event.tenantId === input.tenantId &&
      event.subjectId === input.subjectId &&
      consentEvidenceMatchesPurpose(input, event) &&
      !isGenericTermsPrivacyConsentSource(event.sourceSurface) &&
      consentScopeMatchesInput(input.scope, event.scope) &&
      event.status === 'accepted' &&
      Number.isFinite(Date.parse(event.recordedAt))
  );
}

function consentScopeMatchesInput(inputScope: PrivacyScope, eventScope: PrivacyScope | undefined) {
  return PRIVACY_SCOPE_KEYS.every(key => {
    const requiredValue = inputScope[key];
    return requiredValue === undefined || eventScope?.[key] === requiredValue;
  });
}

function consentEvidenceMatchesPurpose(
  input: AICallContextMintInput,
  event: AICallContextConsentEvidence['consentEvents'][number]
): boolean {
  return input.purpose === 'document_extraction'
    ? event.consentType === 'ai_document_extraction' && event.purpose === 'ai_document_extraction'
    : event.purpose === input.processingPurpose;
}

function validateDocumentExtractionEvidence(
  input: AICallContextMintInput,
  scope: PrivacyScope,
  evidence: AICallContextConsentEvidence
) {
  if (!evidence.documentPolicy || !evidence.modelBoundary || !evidence.promptOrSchemaVersion) {
    return { kind: 'blocked' as const, reasons: ['document_extraction_evidence_missing'] };
  }

  return evaluateAiExtractionPolicy({
    tenantId: input.tenantId,
    subjectId: input.subjectId as string,
    workflow: input.workflowId,
    modelBoundary: evidence.modelBoundary,
    noTraining: evidence.noTraining ?? true,
    zeroRetention: evidence.zeroRetention ?? input.retention === 'zero_retention_no_training',
    promptOrSchemaVersion: evidence.promptOrSchemaVersion,
    requestedPurpose: evidence.requestedPurpose ?? 'ai_document_extraction',
    scope,
    documentPolicy: evidence.documentPolicy,
    consentEvents: evidence.consentEvents,
  });
}
