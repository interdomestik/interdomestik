import type { AICallContextFields } from './ai';
import { brandAICallContext } from './ai-call-context-brand';
import {
  readOwnTrimmedString,
  readOwnValue,
  UNREADABLE_OWN_VALUE,
} from './ai-call-context-own-value';
import type { PrivacyScope } from './types';

export function buildAICallContext(
  input: Record<string, unknown>,
  scope: PrivacyScope
): ReturnType<typeof brandAICallContext> {
  const subjectId = readOwnTrimmedString(input, 'subjectId');

  const fields: AICallContextFields = {
    workflowId: readOwnTrimmedString(input, 'workflowId'),
    owner: readOwnTrimmedString(input, 'owner'),
    tenantId: readOwnTrimmedString(input, 'tenantId'),
    actorId: readOwnTrimmedString(input, 'actorId'),
    ...(subjectId !== undefined && subjectId !== UNREADABLE_OWN_VALUE ? { subjectId } : {}),
    scope,
    purpose: readOwnValue(input, 'purpose'),
    processingPurpose: readOwnValue(input, 'processingPurpose'),
    retention: readOwnValue(input, 'retention'),
    posture: readOwnValue(input, 'posture'),
    consent: readOwnValue(input, 'consent'),
    invalidityPosture: readOwnValue(input, 'invalidityPosture'),
  } as AICallContextFields;

  return brandAICallContext(fields);
}
