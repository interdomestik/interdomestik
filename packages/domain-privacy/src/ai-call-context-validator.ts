import {
  AI_CALL_CONSENT_POSTURES,
  AI_CALL_INVALIDITY_POSTURES,
  AI_CALL_POSTURES,
  AI_CALL_PURPOSES,
  AI_CALL_RETENTION_POSTURES,
  type AICallContext,
  type AICallContextInvalidReason,
  type AICallContextValidationDecision,
} from './ai';
import { PROCESSING_PURPOSES, type PrivacyScope } from './types';

const SCOPE_KEYS = ['caseId', 'claimId', 'assistanceSessionId', 'documentId'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasLiteral<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function readPrivacyScope(value: unknown): PrivacyScope | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const scope: PrivacyScope = {};
  for (const key of SCOPE_KEYS) {
    if (value[key] === undefined) continue;
    if (!isNonEmptyString(value[key])) {
      return undefined;
    }
    scope[key] = value[key];
  }

  return Object.keys(scope).length > 0 ? scope : undefined;
}

export function validateAICallContext(input: unknown): AICallContextValidationDecision {
  if (!isRecord(input)) {
    return { kind: 'invalid', reasons: ['context_missing'] };
  }

  const reasons: AICallContextInvalidReason[] = [];
  const scope = readPrivacyScope(input.scope);

  if (!isNonEmptyString(input.workflowId)) {
    reasons.push('workflow_id_missing');
  }
  if (!isNonEmptyString(input.owner)) {
    reasons.push('owner_missing');
  }
  if (!isNonEmptyString(input.tenantId)) {
    reasons.push('tenant_id_missing');
  }
  if (!isNonEmptyString(input.actorId)) {
    reasons.push('actor_id_missing');
  }
  if (input.subjectId !== undefined && !isNonEmptyString(input.subjectId)) {
    reasons.push('subject_id_invalid');
  }
  if (input.scope === undefined) {
    reasons.push('scope_missing');
  } else if (!scope) {
    reasons.push('scope_invalid');
  }
  if (!hasLiteral(input.processingPurpose, PROCESSING_PURPOSES)) {
    reasons.push('processing_purpose_unsupported');
  }
  if (!hasLiteral(input.purpose, AI_CALL_PURPOSES)) {
    reasons.push('purpose_unsupported');
  }
  if (!hasLiteral(input.retention, AI_CALL_RETENTION_POSTURES)) {
    reasons.push('retention_unsupported');
  }
  if (input.posture === undefined) {
    reasons.push('posture_missing');
  } else if (!hasLiteral(input.posture, AI_CALL_POSTURES)) {
    reasons.push('posture_unsupported');
  }
  if (input.consent === undefined) {
    reasons.push('consent_missing');
  } else if (!hasLiteral(input.consent, AI_CALL_CONSENT_POSTURES)) {
    reasons.push('consent_unsupported');
  }
  if (input.invalidityPosture === undefined) {
    reasons.push('invalidity_posture_missing');
  } else if (!hasLiteral(input.invalidityPosture, AI_CALL_INVALIDITY_POSTURES)) {
    reasons.push('invalidity_posture_unsupported');
  }

  if (input.posture === 'disabled' && input.purpose !== 'general_case') {
    reasons.push('disabled_posture_requires_general_case');
  }

  if (input.purpose === 'document_extraction') {
    if (input.processingPurpose !== 'ai_document_extraction') {
      reasons.push('processing_purpose_mismatch');
    }
    if (input.retention !== 'zero_retention_no_training') {
      reasons.push('document_extraction_requires_zero_retention');
    }
    if (input.consent !== 'required_granted') {
      reasons.push('document_extraction_requires_consent');
    }
  }

  if (input.purpose === 'invalidity_review') {
    if (input.processingPurpose !== 'invalidity_review') {
      reasons.push('processing_purpose_mismatch');
    }
    if (
      input.posture !== 'human_review_required' ||
      input.invalidityPosture !== 'human_review_required'
    ) {
      reasons.push('invalidity_review_requires_human_review');
    }
    if (input.consent !== 'required_granted') {
      reasons.push('invalidity_review_requires_consent');
    }
  }

  return reasons.length === 0
    ? {
        kind: 'valid',
        context: {
          workflowId: input.workflowId,
          owner: input.owner,
          tenantId: input.tenantId,
          actorId: input.actorId,
          ...(input.subjectId === undefined ? {} : { subjectId: input.subjectId }),
          scope: scope as PrivacyScope,
          purpose: input.purpose,
          processingPurpose: input.processingPurpose,
          retention: input.retention,
          posture: input.posture,
          consent: input.consent,
          invalidityPosture: input.invalidityPosture,
        } as AICallContext,
        reasons: [],
      }
    : { kind: 'invalid', reasons };
}
