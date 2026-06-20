import type { AICallContextValidationDecision } from './ai';
import {
  collectAICallContextInvalidReasons,
  isRecord,
  readPrivacyScope,
} from './ai-call-context-validation-rules';
import { readOwnValue, snapshotOwnValues } from './ai-call-context-own-value';
import { buildAICallContext } from './ai-call-context-validation-result';
import type { PrivacyScope } from './types';

const AI_CALL_CONTEXT_KEYS = [
  'workflowId',
  'owner',
  'tenantId',
  'actorId',
  'subjectId',
  'scope',
  'purpose',
  'processingPurpose',
  'retention',
  'posture',
  'consent',
  'invalidityPosture',
] as const;

export function validateAICallContext(input: unknown): AICallContextValidationDecision {
  if (!isRecord(input)) {
    return { kind: 'invalid', reasons: ['context_missing'] };
  }

  const snapshot = snapshotOwnValues(input, AI_CALL_CONTEXT_KEYS);
  const scope = readPrivacyScope(readOwnValue(snapshot, 'scope'));
  const reasons = collectAICallContextInvalidReasons(snapshot, scope);

  return reasons.length === 0
    ? { kind: 'valid', context: buildAICallContext(snapshot, scope as PrivacyScope), reasons: [] }
    : { kind: 'invalid', reasons };
}
