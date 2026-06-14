import type { BillingEntity } from '@interdomestik/domain-membership-billing/paddle-server';
import {
  parsePaddleWebhookBody,
  verifyPaddleWebhook,
} from '@interdomestik/domain-membership-billing/paddle-webhooks';

import type { Paddle } from '@paddle/paddle-node-sdk';

import { handlePaddleWebhookCore, type PaddleWebhookCoreResult } from '../_core';
import { isEntityMismatch } from './entity-mismatch';

async function preflightEntityMismatchCheck(args: {
  expectedEntity: BillingEntity;
  paddle: Paddle;
  signature: string | null;
  secret: string | undefined;
  bodyText: string;
}): Promise<'pass' | 'mismatch' | 'signature-invalid'> {
  if (!args.signature || !args.secret) {
    return 'pass';
  }

  const { parsedPayload } = parsePaddleWebhookBody(args.bodyText);

  try {
    const verified = await verifyPaddleWebhook({
      paddle: args.paddle,
      body: args.bodyText,
      secret: args.secret,
      signature: args.signature,
      parsedPayload,
    });

    const eventData = (verified.eventData ?? {}) as { data?: unknown };
    if (!eventData.data) return 'pass';

    const mismatch = await isEntityMismatch(args.expectedEntity, eventData.data);
    return mismatch ? 'mismatch' : 'pass';
  } catch {
    return 'signature-invalid';
  }
}

export async function handlePaddleWebhookEntityCore(args: {
  expectedEntity: BillingEntity;
  paddle: Paddle;
  headers: Headers;
  signature: string | null;
  secret: string | undefined;
  bodyText: string;
}): Promise<PaddleWebhookCoreResult> {
  const preflightResult = await preflightEntityMismatchCheck(args);

  if (preflightResult === 'mismatch') {
    return { status: 401, body: { error: 'Webhook entity mismatch' } };
  }

  return handlePaddleWebhookCore({
    paddle: args.paddle,
    headers: args.headers,
    signature: args.signature,
    secret: args.secret,
    bodyText: args.bodyText,
    billingEntity: args.expectedEntity,
  });
}
