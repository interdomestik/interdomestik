import { validateAICallContext, type AICallContext } from '@interdomestik/domain-privacy';

export type DomainAiCallContext = AICallContext;

export function requireAICallContext(context: unknown): DomainAiCallContext {
  const decision = validateAICallContext(context);

  if (decision.kind === 'invalid') {
    throw new Error(`AI call context is required: ${decision.reasons.join(',')}`);
  }

  return decision.context;
}
