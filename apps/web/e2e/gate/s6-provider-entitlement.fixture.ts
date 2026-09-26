import {
  and,
  auditLog,
  db,
  domainEventDeliveries,
  domainEvents,
  eq,
  inArray,
  or,
  sql,
  subscriptions,
  webhookEvents,
} from '@interdomestik/database';
import { expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

const KS_WEBHOOK_SECRET =
  process.env.PADDLE_WEBHOOK_SECRET_KEY_KS ??
  `${process.env.PADDLE_WEBHOOK_SECRET_KEY ?? 'whsec_e2e_shared'}_ks`;

export type S6ActivationIdentity = {
  eventId: string;
  providerSubscriptionId: string;
  tenantId: string;
  userId: string;
};

function paddleSignature(body: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', KS_WEBHOOK_SECRET)
    .update(`${timestamp}:${body}`)
    .digest('hex');
  return `ts=${timestamp};h1=${digest}`;
}

export async function postKsWebhook(page: Page, origin: string, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  return page.request.post(`${origin}/api/webhooks/paddle/ks`, {
    data: body,
    failOnStatusCode: false,
    headers: {
      'content-type': 'application/json',
      'paddle-signature': paddleSignature(body),
    },
  });
}

export async function cleanupActivation(args: S6ActivationIdentity) {
  const receipts = await db.query.webhookEvents.findMany({
    columns: { id: true },
    where: and(
      eq(webhookEvents.provider, 'paddle'),
      eq(webhookEvents.processingScopeKey, 'entity:ks'),
      eq(webhookEvents.eventId, args.eventId)
    ),
  });
  const receiptIds = receipts.map(receipt => receipt.id);
  const events = await db.query.domainEvents.findMany({
    columns: { id: true },
    where: and(
      eq(domainEvents.tenantId, args.tenantId),
      eq(domainEvents.entityId, args.providerSubscriptionId)
    ),
  });
  const eventIds = events.map(event => event.id);

  await db.transaction(async tx => {
    if (eventIds.length) {
      await tx
        .delete(domainEventDeliveries)
        .where(inArray(domainEventDeliveries.eventId, eventIds));
      await tx.delete(domainEvents).where(inArray(domainEvents.id, eventIds));
    }
    await tx
      .delete(auditLog)
      .where(
        or(
          and(
            eq(auditLog.tenantId, args.tenantId),
            eq(auditLog.entityId, args.providerSubscriptionId)
          ),
          ...(receiptIds.length ? [inArray(auditLog.entityId, receiptIds)] : []),
          sql`${auditLog.metadata}->>'eventId' = ${args.eventId}`
        )
      );
    if (receiptIds.length) {
      await tx.delete(webhookEvents).where(inArray(webhookEvents.id, receiptIds));
    }
    await tx
      .delete(subscriptions)
      .where(
        and(
          eq(subscriptions.tenantId, args.tenantId),
          eq(subscriptions.userId, args.userId),
          eq(subscriptions.providerSubscriptionId, args.providerSubscriptionId)
        )
      );
  });
}

export async function expectActivationClean(args: S6ActivationIdentity) {
  const [membership, receipt, event, audit] = await Promise.all([
    db.query.subscriptions.findMany({
      columns: { id: true },
      where: and(
        eq(subscriptions.tenantId, args.tenantId),
        eq(subscriptions.userId, args.userId),
        eq(subscriptions.providerSubscriptionId, args.providerSubscriptionId)
      ),
    }),
    db.query.webhookEvents.findMany({
      columns: { id: true },
      where: and(
        eq(webhookEvents.provider, 'paddle'),
        eq(webhookEvents.processingScopeKey, 'entity:ks'),
        eq(webhookEvents.eventId, args.eventId)
      ),
    }),
    db.query.domainEvents.findMany({
      columns: { id: true },
      where: and(
        eq(domainEvents.tenantId, args.tenantId),
        eq(domainEvents.entityId, args.providerSubscriptionId)
      ),
    }),
    db.query.auditLog.findMany({
      columns: { id: true },
      where: or(
        and(
          eq(auditLog.tenantId, args.tenantId),
          eq(auditLog.entityId, args.providerSubscriptionId)
        ),
        sql`${auditLog.metadata}->>'eventId' = ${args.eventId}`
      ),
    }),
  ]);
  expect({ audit, event, membership, receipt }).toEqual({
    audit: [],
    event: [],
    membership: [],
    receipt: [],
  });
}
