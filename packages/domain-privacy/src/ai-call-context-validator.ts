import type { AICallContextValidationDecision } from './ai';
import {
  collectAICallContextInvalidReasons,
  isRecord,
  readPrivacyScope,
} from './ai-call-context-validation-rules';
import { buildAICallContext } from './ai-call-context-validation-result';
import type { PrivacyScope } from './types';

export function validateAICallContext(input: unknown): AICallContextValidationDecision {
  if (!isRecord(input)) {
    return { kind: 'invalid', reasons: ['context_missing'] };
  }

  const scope = readPrivacyScope(input.scope);
  const reasons = collectAICallContextInvalidReasons(input, scope);

  return reasons.length === 0
    ? { kind: 'valid', context: buildAICallContext(input, scope as PrivacyScope), reasons: [] }
    : { kind: 'invalid', reasons };
}
