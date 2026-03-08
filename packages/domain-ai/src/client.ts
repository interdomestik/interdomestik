import OpenAI from 'openai';

export type AiClientOptions = ConstructorParameters<typeof OpenAI>[0];

export function createAiClient(options: AiClientOptions = {}): OpenAI {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to create an AI client.');
  }

  return new OpenAI({
    ...options,
    apiKey,
  });
}
