import { Environment, Paddle } from '@paddle/paddle-node-sdk';

let paddleClient: Paddle | null = null;

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`${name} is missing`);
  }
  return value;
}

export function getPaddle(): Paddle {
  if (paddleClient) return paddleClient;

  const apiKey = getRequiredEnv('PADDLE_API_KEY');
  const env = (getOptionalEnv('NEXT_PUBLIC_PADDLE_ENV') as Environment) || Environment.sandbox;

  paddleClient = new Paddle(apiKey, {
    environment: env,
  });

  return paddleClient;
}
