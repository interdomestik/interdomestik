import { createHash } from 'node:crypto';
import { and, eq, type DomainEventTx, type TenantTransaction } from '@interdomestik/database';
import { auditLog, engagementEmailSends } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { z } from 'zod';

import { pastDueAccessContinuesInTx } from './dunning-sponsor';
import { RetryablePaddleWebhookError } from '../errors';
import type { PastDueEmailDeps, PreparedPastDueEmail } from '../types';
import {
  lockSubscriptionEventOrder,
  type PaddleSubscriptionEventOrder,
} from './subscription-event-order';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type PastDueEffectScope = {
  authority: TenantAuthority;
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
  source: z.unknown().optional(),
});

function effectKey(scope: PastDueEffectScope): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        readTenantAuthority(scope.authority).tenantId,
        scope.order.processingScopeKey,
        scope.providerSubscriptionId,
        scope.order.providerEventId,
        scope.order.occurredAt,
      ])
    )
    .digest('hex');
  return `${TEMPLATE}:${digest}`;
}

/** The past-due effects of one ordered snapshot, derived from its locked state. */
export type PastDueEffectInput = {
  userId: string;
  newDunningCount: number;
  gracePeriodEnd: Date;
  request: PreparedPastDueEmail | null;
  coverageCopy?: {
    covered: PreparedPastDueEmail;
    uncovered: PreparedPastDueEmail;
    periodEnd: string | null;
  };
};

/** Audit and immutable email intent commit with the locked ordered snapshot. */
export async function persistPastDueEffects(
  tx: DomainEventTx,
  args: PastDueEffectScope & PastDueEffectInput
): Promise<void> {
  const key = effectKey(args);
  const { tenantId } = readTenantAuthority(args.authority);
  // db-access-guard: tenant-scoped -- reason: canonical tenant context and deterministic scoped audit identity share the snapshot transaction.
  await tx.insert(auditLog).values({
    id: key,
    tenantId,
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
    tenantId,
    userId: args.userId,
    subscriptionId: args.subscriptionId,
    templateKey: TEMPLATE,
    status: 'pending',
    metadata: { request: requestSchema.parse(args.request), coverageCopy: args.coverageCopy },
  });
}

/** Replay keeps event payment/recipient facts, but selects copy using current sponsor coverage. */
export async function deliverPastDueEffects(
  args: PastDueEffectScope,
  deps: PastDueEmailDeps
): Promise<void> {
  const key = effectKey(args);
  const { tenantId } = readTenantAuthority(args.authority);
  await withTenantAuthority(args.authority, async tx => {
    // Same lock order as the writer. Keep it through send/ack so a newer lifecycle
    // snapshot cannot commit between the current-event check and notification.
    const decision = await lockSubscriptionEventOrder(tx, {
      order: args.order,
      providerSubscriptionId: args.providerSubscriptionId,
      subscriptionId: args.subscriptionId,
      tenantId,
      requireExactAggregate: true,
    });
    if (decision.kind !== 'replayed') return;
    const scope = and(
      eq(engagementEmailSends.tenantId, tenantId),
      eq(engagementEmailSends.subscriptionId, args.subscriptionId),
      eq(engagementEmailSends.dedupeKey, key),
      eq(engagementEmailSends.templateKey, TEMPLATE)
    );
    // db-access-guard: tenant-scoped -- reason: exact tenant/subscription/event delivery under the subscription row lock.
    const [delivery] = await tx.select().from(engagementEmailSends).where(scope).for('update');
    if (!delivery || ['sent', 'skipped'].includes(delivery.status)) return;
    if (delivery.status !== 'pending')
      throw new RetryablePaddleWebhookError('Past-due delivery requires reconciliation');
    const age = Date.now() - delivery.createdAt.getTime();
    if (age < 0 || age >= SAFE_RETRY_MS) {
      throw new RetryablePaddleWebhookError(
        'Past-due delivery retry window expired; reconcile provider acceptance'
      );
    }
    const request = await selectPastDueCopy(tx, {
      tenantId,
      userId: delivery.userId,
      metadata: delivery.metadata,
    });
    // Keep the original key and retry window. An uncertain prior send or changed-payload
    // provider rejection remains unconfirmed; never rotate the key to force another email.
    if (!deps.sendPreparedPastDueEmail)
      throw new RetryablePaddleWebhookError('Past-due email sender unavailable');
    const result = await deps.sendPreparedPastDueEmail(request, key);
    if (!result.success && result.error === 'email_suppressed') {
      // db-access-guard: tenant-scoped -- reason: records non-delivery for the exact locked tenant/event intent.
      await tx
        .update(engagementEmailSends)
        .set({ status: 'skipped', error: result.error, providerMessageId: null, sentAt: null })
        .where(scope);
      return;
    }
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

const coverageCopySchema = z.object({
  covered: requestSchema,
  uncovered: requestSchema,
  periodEnd: z.string().nullable(),
});

/**
 * ACQ-3b §3.10: delivery re-checks sponsor coverage in the locked transaction and sends the
 * matching event-frozen variant. An intent stored before the variants existed keeps its request.
 */
async function selectPastDueCopy(
  tx: TenantTransaction,
  args: { tenantId: string; userId: string; metadata: Record<string, unknown> | null }
): Promise<PreparedPastDueEmail> {
  const copies = coverageCopySchema.safeParse(args.metadata?.coverageCopy);
  if (!copies.success) return requestSchema.parse(args.metadata?.request);
  const covered = await pastDueAccessContinuesInTx(tx, {
    tenantId: args.tenantId,
    userId: args.userId,
    periodEnd: copies.data.periodEnd ? new Date(copies.data.periodEnd) : null,
    now: new Date(),
  });
  return covered ? copies.data.covered : copies.data.uncovered;
}
