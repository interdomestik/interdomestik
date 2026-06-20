import type { AICallContext } from './ai';
import type { PrivacyScope } from './types';

export function buildAICallContext(
  input: Record<string, unknown>,
  scope: PrivacyScope
): AICallContext {
  return {
    workflowId: input.workflowId,
    owner: input.owner,
    tenantId: input.tenantId,
    actorId: input.actorId,
    ...(input.subjectId === undefined ? {} : { subjectId: input.subjectId }),
    scope,
    purpose: input.purpose,
    processingPurpose: input.processingPurpose,
    retention: input.retention,
    posture: input.posture,
    consent: input.consent,
    invalidityPosture: input.invalidityPosture,
  } as AICallContext;
}
