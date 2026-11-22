import type { TenantTransaction } from '@interdomestik/database';
import {
  auditLog,
  notificationDeliveries as deliveries,
  pushSubscriptions,
} from '@interdomestik/database/schema';
import { and, eq, getTableColumns, inArray, not, or, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import type { EmailTransport } from '../email';
import { notificationDeliveryKey, type EnqueueDelivery } from './keys';
import { deliveryFailure, failureTransition } from './transport';
import type {
  AttemptResult,
  ClaimedDelivery,
  Delivery,
  DeliveryTransport,
  PushDeliverySubscription,
} from './types';

function isStale() {
  return sql<boolean>`${deliveries.createdAt} + interval '72 hours' <= clock_timestamp()`;
}

export async function enqueueNotificationDelivery(tx: TenantTransaction, input: EnqueueDelivery) {
  const [row] = await tx
    .insert(deliveries)
    .values({
      id: input.id,
      tenantId: input.tenantId,
      claimId: input.claimId,
      kind: input.kind,
      channel: input.channel,
      recipientUserId: input.recipientUserId,
      subjectMessageId: 'messageId' in input ? input.messageId : null,
      pushSubscriptionId: input.channel === 'push' ? input.pushSubscriptionId : null,
      facts: 'facts' in input ? input.facts : {},
      idempotencyKey: notificationDeliveryKey(input),
    })
    .onConflictDoNothing({ target: [deliveries.tenantId, deliveries.idempotencyKey] })
    .returning({ id: deliveries.id });
  return row?.id ?? null;
}

export function underLease(row: ClaimedDelivery) {
  return and(
    eq(deliveries.tenantId, row.tenantId),
    eq(deliveries.id, row.id),
    eq(deliveries.state, 'claimed'),
    eq(deliveries.leaseUntil, row.leaseUntil)
  );
}

export async function readDeliveryUnderLease(tx: TenantTransaction, lease: ClaimedDelivery) {
  const [row] = await tx
    .select({
      ...getTableColumns(deliveries),
      stale: isStale(),
    })
    .from(deliveries)
    .where(underLease(lease))
    .for('update');
  return row;
}

export async function recordDeliveryAudit(
  tx: TenantTransaction,
  row: Pick<Delivery, 'id' | 'kind' | 'tenantId'>,
  action: 'notification.delivery_failed' | 'notification.delivery_redriven',
  extras: { code?: string; actorId?: string; actorRole?: string }
) {
  await tx.insert(auditLog).values({
    id: randomUUID(),
    tenantId: row.tenantId,
    action,
    entityType: 'notification_delivery',
    entityId: row.id,
    actorId: extras.actorId,
    actorRole: extras.actorRole,
    metadata: { kind: row.kind, ...(extras.code ? { code: extras.code } : {}) },
  });
}

export async function claimNotificationDelivery(
  tx: TenantTransaction,
  tenantId: string,
  ids?: readonly string[]
) {
  if (ids?.length === 0) return null;
  const [row] = await tx
    .select()
    .from(deliveries)
    .where(
      and(
        eq(deliveries.tenantId, tenantId),
        or(
          and(eq(deliveries.state, 'queued'), sql`${deliveries.nextAttemptAt} <= now()`),
          and(eq(deliveries.state, 'claimed'), sql`${deliveries.leaseUntil} < now()`)
        ),
        ids && inArray(deliveries.id, ids)
      )
    )
    .orderBy(deliveries.nextAttemptAt, deliveries.id)
    .limit(1)
    .for('update', { skipLocked: true });
  if (!row) return null;
  const selected = and(eq(deliveries.tenantId, tenantId), eq(deliveries.id, row.id));
  if (row.attempts === 8) {
    const failure = deliveryFailure('lease_expired', false);
    await tx
      .update(deliveries)
      .set({
        state: 'failed',
        leaseUntil: null,
        terminalAt: sql`clock_timestamp()`,
        lastErrorCode: failure.code,
        lastErrorDetail: failure.detail,
      })
      .where(selected);
    await recordDeliveryAudit(tx, row, 'notification.delivery_failed', { code: failure.code });
    return { status: 'failed' as const, id: row.id };
  }

  const [claimed] = await tx
    .update(deliveries)
    .set({
      state: 'claimed',
      leaseUntil: sql`clock_timestamp() + interval '10 minutes'`,
      attempts: row.attempts + 1,
    })
    .where(selected)
    .returning();
  if (!claimed?.leaseUntil) throw new Error('Claimed delivery has no lease');
  return { status: 'claimed' as const, row: { ...claimed, leaseUntil: claimed.leaseUntil } };
}

export async function refundNotificationAttempt(
  tx: TenantTransaction,
  row: ClaimedDelivery,
  restoreTransport = false
) {
  const [refunded] = await tx
    .update(deliveries)
    .set({
      state: 'queued',
      leaseUntil: null,
      attempts: row.attempts - 1,
      nextAttemptAt: sql`clock_timestamp()`,
      ...(restoreTransport && { transport: row.transport }),
    })
    .where(underLease(row))
    .returning({ id: deliveries.id });
  return Boolean(refunded);
}

export async function writeNotificationTransport(
  tx: TenantTransaction,
  row: ClaimedDelivery,
  transport: DeliveryTransport,
  callDeadline: number,
  now: () => number
) {
  const writeStartedAt = now();
  const [written] = await tx
    .update(deliveries)
    .set({ transport })
    .where(
      and(
        underLease(row),
        sql`${deliveries.leaseUntil} - clock_timestamp() >= interval '5 minutes'`,
        not(isStale())
      )
    )
    .returning({
      remainingLifetimeMs:
        sql`extract(epoch from (${deliveries.createdAt} + interval '72 hours' - clock_timestamp())) * 1000`.mapWith(
          Number
        ),
    });
  if (!written) {
    const [owned] = await tx
      .select({ stale: isStale() })
      .from(deliveries)
      .where(underLease(row))
      .for('update');
    if (owned?.stale) return 'stale';
    return owned && (await refundNotificationAttempt(tx, row)) ? 'lease_short' : 'lease_lost';
  }
  // Include database and transaction latency in the elapsed lifetime before dispatch.
  const expiresAt = writeStartedAt + written.remainingLifetimeMs;
  const afterWrite = now();
  if (expiresAt <= afterWrite) return 'stale';
  if (callDeadline - afterWrite >= 1000) return { expiresAt };
  return (await refundNotificationAttempt(tx, row, true)) ? 'budget_short' : 'lease_lost';
}

export async function finishNotificationDelivery(
  tx: TenantTransaction,
  row: ClaimedDelivery,
  result: AttemptResult,
  locale: Delivery['locale'],
  transport: DeliveryTransport | null,
  configured: readonly EmailTransport[],
  subscription?: PushDeliverySubscription
) {
  let state: Delivery['state'];
  let failureCode: string | undefined;
  let fields: PgUpdateSetSource<typeof deliveries> = {};
  if ('skip' in result) {
    state = 'skipped';
    fields = {
      skipReason: result.skip,
      ...(result.skip === 'stale' && { transport: row.transport }),
    };
  } else if (result.ok) {
    state = 'sent';
    fields = { sentAt: sql`clock_timestamp()`, avoidTransport: null };
  } else {
    failureCode = result.code;
    const transition = failureTransition(row, result, transport, configured);
    state = transition.retry ? 'queued' : 'failed';
    fields = {
      lastErrorCode: result.code,
      lastErrorDetail: result.detail,
      transport: transition.transport,
      avoidTransport: transition.avoidTransport,
    };
    if (transition.retry) {
      fields.nextAttemptAt = sql`clock_timestamp() + interval '1 millisecond' * ${transition.delayMs}`;
    }
  }

  const [finished] = await tx
    .update(deliveries)
    .set({
      lastErrorCode: null,
      lastErrorDetail: null,
      ...fields,
      state,
      leaseUntil: null,
      terminalAt: state === 'queued' ? null : sql`clock_timestamp()`,
      ...(locale && { locale }),
    })
    .where(underLease(row))
    .returning({ id: deliveries.id });
  if (!finished) return 'lease_lost';
  if (state === 'failed') {
    if (
      failureCode === 'subscription_gone' &&
      row.channel === 'push' &&
      row.pushSubscriptionId &&
      subscription
    ) {
      await tx
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.tenantId, row.tenantId),
            eq(pushSubscriptions.userId, row.recipientUserId),
            eq(pushSubscriptions.id, row.pushSubscriptionId),
            sql`${pushSubscriptions}."xmin"::text = ${subscription.version}`
          )
        );
    }
    await recordDeliveryAudit(tx, row, 'notification.delivery_failed', { code: failureCode });
  }
  return state;
}
