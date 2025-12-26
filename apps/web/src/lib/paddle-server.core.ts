import { Environment, Paddle } from '@paddle/paddle-node-sdk';

import { getOptionalEnv, getRequiredEnv } from './env';

let paddleClient: Paddle | null = null;

export function getPaddle(): Paddle {
  if (paddleClient) return paddleClient;

  const apiKey = getRequiredEnv('PADDLE_API_KEY');
  const env = (getOptionalEnv('NEXT_PUBLIC_PADDLE_ENV') as Environment) || Environment.sandbox;

  paddleClient = new Paddle(apiKey, {
    environment: env,
  });

  return paddleClient;
}
