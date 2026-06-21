import type { AICallContext, AICallContextFields } from './ai';

const trustedAICallContexts = new WeakSet<object>();

export function brandAICallContext(fields: AICallContextFields): AICallContext {
  const context = Object.freeze({ ...fields }) as AICallContext;
  trustedAICallContexts.add(context);
  return context;
}

export function hasAICallContextBrand(input: Record<PropertyKey, unknown>): boolean {
  return trustedAICallContexts.has(input);
}
