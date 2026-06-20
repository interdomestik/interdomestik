import {
  AI_CALL_CONSENT_POSTURES,
  AI_CALL_INVALIDITY_POSTURES,
  AI_CALL_POSTURES,
  AI_CALL_PURPOSES,
  AI_CALL_RETENTION_POSTURES,
  type AICallContextInvalidReason,
} from './ai';
import { appendPurposeReasons } from './ai-call-context-purpose-rules';
import { PROCESSING_PURPOSES, type PrivacyScope } from './types';

const SCOPE_KEYS = ['caseId', 'claimId', 'assistanceSessionId', 'documentId'] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasLiteral<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

export function readPrivacyScope(value: unknown): PrivacyScope | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const scope: PrivacyScope = {};
  for (const key of SCOPE_KEYS) {
    if (value[key] === undefined) continue;
    if (!isNonEmptyString(value[key])) return undefined;
    scope[key] = value[key];
  }

  return Object.keys(scope).length > 0 ? scope : undefined;
}

export function collectAICallContextInvalidReasons(
  input: Record<string, unknown>,
  scope: PrivacyScope | undefined
): AICallContextInvalidReason[] {
  const reasons: AICallContextInvalidReason[] = [];
  appendIdentityReasons(input, reasons);
  appendScopeReason(input, scope, reasons);
  appendLiteralReasons(input, reasons);
  appendPurposeReasons(input, reasons);
  return reasons;
}

function appendIdentityReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (!isNonEmptyString(input.workflowId)) reasons.push('workflow_id_missing');
  if (!isNonEmptyString(input.owner)) reasons.push('owner_missing');
  if (!isNonEmptyString(input.tenantId)) reasons.push('tenant_id_missing');
  if (!isNonEmptyString(input.actorId)) reasons.push('actor_id_missing');
  if (input.consent === 'required_granted' && input.subjectId === undefined) {
    reasons.push('subject_id_required_for_consent');
  }
  if (input.subjectId !== undefined && !isNonEmptyString(input.subjectId)) {
    reasons.push('subject_id_invalid');
  }
}

function appendScopeReason(
  input: Record<string, unknown>,
  scope: PrivacyScope | undefined,
  reasons: AICallContextInvalidReason[]
): void {
  if (input.scope === undefined) {
    reasons.push('scope_missing');
  } else if (!scope) {
    reasons.push('scope_invalid');
  }
}

function appendLiteralReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (!hasLiteral(input.processingPurpose, PROCESSING_PURPOSES)) {
    reasons.push('processing_purpose_unsupported');
  }
  if (!hasLiteral(input.purpose, AI_CALL_PURPOSES)) reasons.push('purpose_unsupported');
  if (!hasLiteral(input.retention, AI_CALL_RETENTION_POSTURES)) {
    reasons.push('retention_unsupported');
  }
  appendPostureLiteralReasons(input, reasons);
  appendConsentLiteralReasons(input, reasons);
  appendInvalidityLiteralReasons(input, reasons);
}

function appendPostureLiteralReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (input.posture === undefined) {
    reasons.push('posture_missing');
  } else if (!hasLiteral(input.posture, AI_CALL_POSTURES)) {
    reasons.push('posture_unsupported');
  }
}

function appendConsentLiteralReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (input.consent === undefined) {
    reasons.push('consent_missing');
  } else if (!hasLiteral(input.consent, AI_CALL_CONSENT_POSTURES)) {
    reasons.push('consent_unsupported');
  }
}

function appendInvalidityLiteralReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (input.invalidityPosture === undefined) {
    reasons.push('invalidity_posture_missing');
  } else if (!hasLiteral(input.invalidityPosture, AI_CALL_INVALIDITY_POSTURES)) {
    reasons.push('invalidity_posture_unsupported');
  }
}
