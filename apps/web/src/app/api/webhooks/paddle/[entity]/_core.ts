import { db } from '@interdomestik/database';
import {
  resolveBillingEntityForTenantId,
  resolveBillingEntityFromPathSegment,
  type BillingEntity,
} from '@interdomestik/domain-membership-billing/paddle-server';
import {
  parsePaddleWebhookBody,
  verifyPaddleWebhook,
} from '@interdomestik/domain-membership-billing/paddle-webhooks';

import type { Paddle } from '@paddle/paddle-node-sdk';

import { handlePaddleWebhookCore, type PaddleWebhookCoreResult } from '../_core';

type PaddleWebhookCustomData = {
  userId?: string;
  tenantId?: string;
  tenant_id?: string;
  entity?: string;
  billingEntity?: string;
  billing_entity?: string;
};

type PaddleWebhookData = {
  id?: string;
  subscriptionId?: string | null;
  subscription_id?: string | null;
  customData?: PaddleWebhookCustomData;
  custom_data?: PaddleWebhookCustomData;
};

function resolveCustomData(payload: PaddleWebhookData): PaddleWebhookCustomData {
  return (payload.customData || payload.custom_data || {}) as PaddleWebhookCustomData;
}

function resolveExplicitTenantId(data: unknown): string | null {
  const payload = (data ?? {}) as PaddleWebhookData;
  const customData = resolveCustomData(payload);
  const tenantId = customData.tenantId || customData.tenant_id;
  if (!tenantId || typeof tenantId !== 'string') return null;
  const normalized = tenantId.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveExplicitEntity(data: unknown): BillingEntity | null {
  const payload = (data ?? {}) as PaddleWebhookData;
  const customData = resolveCustomData(payload);
  const entityValue = customData.entity || customData.billingEntity || customData.billing_entity;
  return resolveBillingEntityFromPathSegment(entityValue);
}

async function resolveTenantIdFromWebhookData(data: unknown): Promise<string | null> {
  try {
    const payload = (data ?? {}) as PaddleWebhookData;
    const customData = resolveCustomData(payload);
    const userId = customData.userId;

    if (userId) {
      const userRecord = await db.query.user.findFirst({
        where: (users, { eq }) => eq(users.id, userId),
        columns: { tenantId: true },
      });
      if (userRecord?.tenantId) return userRecord.tenantId;
    }

    const subscriptionId = payload.id || payload.subscriptionId || payload.subscription_id;
    if (!subscriptionId) return null;

    const subscription = await db.query.subscriptions.findFirst({
      where: (subs, { eq }) => eq(subs.id, subscriptionId),
      columns: { tenantId: true },
    });

    return subscription?.tenantId ?? null;
  } catch {
    return null;
  }
}

async function isEntityMismatch(expectedEntity: BillingEntity, data: unknown): Promise<boolean> {
  const explicitEntity = resolveExplicitEntity(data);
  if (explicitEntity && explicitEntity !== expectedEntity) {
    return true;
  }

  const explicitTenantId = resolveExplicitTenantId(data);
  if (explicitTenantId) {
    const explicitTenantEntity = resolveBillingEntityForTenantId(explicitTenantId);
    if (explicitTenantEntity && explicitTenantEntity !== expectedEntity) {
      return true;
    }
  }

  try {
    const tenantId = await resolveTenantIdFromWebhookData(data);
    if (!tenantId) return false;

    const tenantEntity = resolveBillingEntityForTenantId(tenantId);
    return Boolean(tenantEntity && tenantEntity !== expectedEntity);
  } catch {
    return false;
  }
}

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
  });
}
