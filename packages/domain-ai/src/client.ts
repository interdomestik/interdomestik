import OpenAI from 'openai';

import { requireAICallContext, type DomainAiCallContext } from './context';

export type AiClientOptions = ConstructorParameters<typeof OpenAI>[0];

export function createAiClient(
  context: DomainAiCallContext,
  options: AiClientOptions = {}
): OpenAI {
  requireAICallContext(context);

  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to create an AI client.');
  }

  return new OpenAI({
    ...options,
    apiKey,
  });
}
