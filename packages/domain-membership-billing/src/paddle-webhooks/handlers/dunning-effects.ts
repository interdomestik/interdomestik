import { createHash } from 'node:crypto';
import { and, eq, withTenantContext, type DomainEventTx } from '@interdomestik/database';
import { auditLog, engagementEmailSends } from '@interdomestik/database/schema';
import { z } from 'zod';

import { RetryablePaddleWebhookError } from '../errors';
import type { PastDueEmailDeps, PreparedPastDueEmail } from '../types';
import {
  lockSubscriptionEventOrder,
  type PaddleSubscriptionEventOrder,
} from './subscription-event-order';

type PastDueEffectScope = {
  tenantId: string;
  subscriptionId: string;
  providerSubscriptionId: string;
  order: PaddleSubscriptionEventOrder;
};

const TEMPLATE = 'paddle_past_due_v1';
// Resend retains keys for 24h. Intent creation precedes the first send; reserve
// an hour for request latency/clock skew and never rotate keys.
const SAFE_RETRY_MS = 23 * 60 * 60 * 1000;
const requestSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().min(1),
});

function effectKey(scope: PastDueEffectScope): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        scope.tenantId,
        scope.order.processingScopeKey,
        scope.providerSubscriptionId,
        scope.order.providerEventId,
        scope.order.occurredAt,
      ])
    )
    .digest('hex');
  return `${TEMPLATE}:${digest}`;
}

/** Audit and immutable email intent commit with the locked ordered snapshot. */
export async function persistPastDueEffects(
  tx: DomainEventTx,
  args: PastDueEffectScope & {
    userId: string;
    newDunningCount: number;
    gracePeriodEnd: Date;
    request: PreparedPastDueEmail | null;
  }
): Promise<void> {
  const key = effectKey(args);
  // db-access-guard: tenant-scoped -- reason: canonical tenant context and deterministic scoped audit identity share the snapshot transaction.
  await tx.insert(auditLog).values({
    id: key,
    tenantId: args.tenantId,
    actorRole: 'system',
    action: 'subscription.past_due',
    entityType: 'subscription',
    entityId: args.providerSubscriptionId,
    metadata: {
      dunningAttempt: args.newDunningCount,
      gracePeriodEnd: args.gracePeriodEnd.toISOString(),
      providerEventId: args.order.providerEventId,
    },
  });
  if (!args.request) return;
  // db-access-guard: tenant-scoped -- reason: email intent uses the same canonical tenant and member as the locked snapshot.
  await tx.insert(engagementEmailSends).values({
    id: key,
    dedupeKey: key,
    tenantId: args.tenantId,
    userId: args.userId,
    subscriptionId: args.subscriptionId,
    templateKey: TEMPLATE,
    status: 'pending',
    metadata: { request: requestSchema.parse(args.request) },
  });
}

/** Replay can only finish an existing intent, never reconstruct it from current data. */
export async function deliverPastDueEffects(
  args: PastDueEffectScope,
  deps: PastDueEmailDeps
): Promise<void> {
  const key = effectKey(args);
  await withTenantContext({ tenantId: args.tenantId, role: 'system' }, async tx => {
    // Same lock order as the writer. Keep it through send/ack so a newer lifecycle
    // snapshot cannot commit between the current-event check and notification.
    const decision = await lockSubscriptionEventOrder(tx, { ...args, requireExactAggregate: true });
    if (decision.kind !== 'replayed') return;
    const scope = and(
      eq(engagementEmailSends.tenantId, args.tenantId),
      eq(engagementEmailSends.subscriptionId, args.subscriptionId),
      eq(engagementEmailSends.dedupeKey, key),
      eq(engagementEmailSends.templateKey, TEMPLATE)
    );
    // db-access-guard: tenant-scoped -- reason: exact tenant/subscription/event delivery under the subscription row lock.
    const [delivery] = await tx.select().from(engagementEmailSends).where(scope).for('update');
    if (!delivery || delivery.status === 'sent') return;
    if (delivery.status !== 'pending')
      throw new RetryablePaddleWebhookError('Past-due delivery requires reconciliation');
    const age = Date.now() - delivery.createdAt.getTime();
    if (age < 0 || age >= SAFE_RETRY_MS) {
      throw new RetryablePaddleWebhookError(
        'Past-due delivery retry window expired; reconcile provider acceptance'
      );
    }
    const request = requestSchema.parse(delivery.metadata?.request);
    if (!deps.sendPreparedPastDueEmail)
      throw new RetryablePaddleWebhookError('Past-due email sender unavailable');
    const result = await deps.sendPreparedPastDueEmail(request, key);
    if (!result.success || !result.id)
      throw new RetryablePaddleWebhookError('Past-due email delivery unconfirmed');
    // db-access-guard: tenant-scoped -- reason: acknowledges only the exact locked tenant/event email intent.
    await tx
      .update(engagementEmailSends)
      .set({
        status: 'sent',
        providerMessageId: result.id,
        sentAt: new Date(),
        error: null,
      })
      .where(scope);
  });
}
