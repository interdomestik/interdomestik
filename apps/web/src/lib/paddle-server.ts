import { Environment, Paddle } from '@paddle/paddle-node-sdk';

const apiKey = process.env.PADDLE_API_KEY;

if (!apiKey) {
  throw new Error('PADDLE_API_KEY is missing');
}

export const paddle = new Paddle(apiKey, {
  environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as Environment) || Environment.sandbox,
});
