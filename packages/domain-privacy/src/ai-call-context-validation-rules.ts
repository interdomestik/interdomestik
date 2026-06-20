import {
  AI_CALL_CONSENT_POSTURES,
  AI_CALL_INVALIDITY_POSTURES,
  AI_CALL_POSTURES,
  AI_CALL_PURPOSES,
  AI_CALL_RETENTION_POSTURES,
  type AICallContextInvalidReason,
} from './ai';
import {
  hasOwnKey,
  readOwnTrimmedString,
  readOwnValue,
  UNREADABLE_OWN_VALUE,
} from './ai-call-context-own-value';
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
    const scopeValue = readOwnTrimmedString(value, key);
    if (scopeValue === undefined) continue;
    if (scopeValue === UNREADABLE_OWN_VALUE) return undefined;
    if (!isNonEmptyString(scopeValue)) return undefined;
    scope[key] = scopeValue;
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
  if (!isNonEmptyString(readOwnTrimmedString(input, 'workflowId'))) reasons.push('workflow_id_missing');
  if (!isNonEmptyString(readOwnTrimmedString(input, 'owner'))) reasons.push('owner_missing');
  if (!isNonEmptyString(readOwnTrimmedString(input, 'tenantId'))) reasons.push('tenant_id_missing');
  if (!isNonEmptyString(readOwnTrimmedString(input, 'actorId'))) reasons.push('actor_id_missing');

  const consent = readOwnValue(input, 'consent');
  const subjectId = readOwnTrimmedString(input, 'subjectId');
  if (consent === 'required_granted' && subjectId === undefined) {
    reasons.push('subject_id_required_for_consent');
  }
  if (subjectId !== undefined && !isNonEmptyString(subjectId)) {
    reasons.push('subject_id_invalid');
  }
}

function appendScopeReason(
  input: Record<string, unknown>,
  scope: PrivacyScope | undefined,
  reasons: AICallContextInvalidReason[]
): void {
  if (!hasOwnKey(input, 'scope')) {
    reasons.push('scope_missing');
  } else if (!scope) {
    reasons.push('scope_invalid');
  }
}

function appendLiteralReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  if (!hasLiteral(readOwnValue(input, 'processingPurpose'), PROCESSING_PURPOSES)) {
    reasons.push('processing_purpose_unsupported');
  }
  if (!hasLiteral(readOwnValue(input, 'purpose'), AI_CALL_PURPOSES)) {
    reasons.push('purpose_unsupported');
  }
  if (!hasLiteral(readOwnValue(input, 'retention'), AI_CALL_RETENTION_POSTURES)) {
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
  const posture = readOwnValue(input, 'posture');

  if (posture === undefined) {
    reasons.push('posture_missing');
  } else if (!hasLiteral(posture, AI_CALL_POSTURES)) {
    reasons.push('posture_unsupported');
  }
}

function appendConsentLiteralReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  const consent = readOwnValue(input, 'consent');

  if (consent === undefined) {
    reasons.push('consent_missing');
  } else if (!hasLiteral(consent, AI_CALL_CONSENT_POSTURES)) {
    reasons.push('consent_unsupported');
  }
}

function appendInvalidityLiteralReasons(
  input: Record<string, unknown>,
  reasons: AICallContextInvalidReason[]
): void {
  const invalidityPosture = readOwnValue(input, 'invalidityPosture');

  if (invalidityPosture === undefined) {
    reasons.push('invalidity_posture_missing');
  } else if (!hasLiteral(invalidityPosture, AI_CALL_INVALIDITY_POSTURES)) {
    reasons.push('invalidity_posture_unsupported');
  }
}
