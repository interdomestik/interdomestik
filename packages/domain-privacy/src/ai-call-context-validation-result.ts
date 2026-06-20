import type { AICallContext } from './ai';
import { readOwnValue } from './ai-call-context-own-value';
import type { PrivacyScope } from './types';

export function buildAICallContext(
  input: Record<string, unknown>,
  scope: PrivacyScope
): AICallContext {
  const subjectId = readOwnValue(input, 'subjectId');

  return {
    workflowId: readOwnValue(input, 'workflowId'),
    owner: readOwnValue(input, 'owner'),
    tenantId: readOwnValue(input, 'tenantId'),
    actorId: readOwnValue(input, 'actorId'),
    ...(subjectId === undefined ? {} : { subjectId }),
    scope,
    purpose: readOwnValue(input, 'purpose'),
    processingPurpose: readOwnValue(input, 'processingPurpose'),
    retention: readOwnValue(input, 'retention'),
    posture: readOwnValue(input, 'posture'),
    consent: readOwnValue(input, 'consent'),
    invalidityPosture: readOwnValue(input, 'invalidityPosture'),
  } as AICallContext;
}
