import type { AICallContextValidationDecision } from './ai';
import { hasAICallContextBrand } from './ai-call-context-brand';
import { AI_CALL_CONTEXT_KEYS } from './ai-call-context-keys';
import {
  collectAICallContextInvalidReasons,
  isRecord,
  readPrivacyScope,
} from './ai-call-context-validation-rules';
import { readOwnValue, snapshotOwnValues } from './ai-call-context-own-value';
import { buildAICallContext } from './ai-call-context-validation-result';
import type { PrivacyScope } from './types';

export function validateAICallContext(input: unknown): AICallContextValidationDecision {
  if (!isRecord(input)) {
    return { kind: 'invalid', reasons: ['context_missing'] };
  }

  const snapshot = snapshotOwnValues(input, AI_CALL_CONTEXT_KEYS);
  const scope = readPrivacyScope(readOwnValue(snapshot, 'scope'));
  const reasons = collectAICallContextInvalidReasons(snapshot, scope);

  if (reasons.length === 0 && !hasAICallContextBrand(input)) {
    return { kind: 'invalid', reasons: ['context_untrusted'] };
  }

  return reasons.length === 0
    ? { kind: 'valid', context: buildAICallContext(snapshot, scope as PrivacyScope), reasons: [] }
    : { kind: 'invalid', reasons };
}
