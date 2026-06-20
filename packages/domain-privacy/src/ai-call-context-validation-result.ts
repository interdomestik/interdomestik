import type { AICallContext } from './ai';
import { readOwnTrimmedString, readOwnValue } from './ai-call-context-own-value';
import type { PrivacyScope } from './types';

export function buildAICallContext(
  input: Record<string, unknown>,
  scope: PrivacyScope
): AICallContext {
  const subjectId = readOwnTrimmedString(input, 'subjectId');

  return {
    workflowId: readOwnTrimmedString(input, 'workflowId'),
    owner: readOwnTrimmedString(input, 'owner'),
    tenantId: readOwnTrimmedString(input, 'tenantId'),
    actorId: readOwnTrimmedString(input, 'actorId'),
    ...(typeof subjectId === 'string' ? { subjectId } : {}),
    scope,
    purpose: readOwnValue(input, 'purpose'),
    processingPurpose: readOwnValue(input, 'processingPurpose'),
    retention: readOwnValue(input, 'retention'),
    posture: readOwnValue(input, 'posture'),
    consent: readOwnValue(input, 'consent'),
    invalidityPosture: readOwnValue(input, 'invalidityPosture'),
  } as AICallContext;
}
