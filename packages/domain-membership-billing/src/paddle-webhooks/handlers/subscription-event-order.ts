import {
  and,
  domainEvents,
  eq,
  inArray,
  sql,
  subscriptions,
  webhookEvents,
  type DomainEventTx,
} from '@interdomestik/database';

import { PaddleEventOrderingError } from '../errors';
import { parsePaddleEventOccurredAt } from '../parse';

/** Signed Paddle ordering evidence for one subscription lifecycle event. */
export type PaddleSubscriptionEventOrder = {
  occurredAt: string;
  providerEventId: string;
  /** Exact canonical entity receipt scope (`entity:<billing entity>`). */
  processingScopeKey: string;
};

export type SubscriptionEventOrderDecision =
  { kind: 'apply'; fromStatus: string | null } | { kind: 'replayed' } | { kind: 'stale' };

type OrderComparison = 'newer' | 'equal' | 'older';

type LockSubscriptionEventOrderArgs = {
  /** Deterministic domain event of this provider event; without it an older event is stale. */
  domainEventId?: string;
  order: PaddleSubscriptionEventOrder;
  providerSubscriptionId: string;
  /** Reject a row that holds another provider subscription instead of replacing it. */
  requireExactAggregate?: boolean;
  subscriptionId: string;
  tenantId: string;
};

// Lifecycle receipts whose snapshot may already have been written to the row.
const SUBSCRIPTION_SNAPSHOT_EVENT_TYPES = [
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
  'subscription.paused',
  'subscription.resumed',
  'subscription.past_due',
];

// POSIX mirror of parsePaddleEventOccurredAt for stored receipt payloads.
const RECEIPT_OCCURRED_AT_PATTERN =
  '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$';

/**
 * Entity-scoped lifecycle events must carry signed ordering evidence. Missing or
 * invalid evidence is permanent: the same signed payload can never become orderable.
 */
export function resolveSubscriptionEventOrder(params: {
  processingScopeKey?: string;
  providerEventId?: string;
  providerEventOccurredAt?: string | null;
  providerSubscriptionId: string;
}): PaddleSubscriptionEventOrder | undefined {
  if (!params.processingScopeKey?.startsWith('entity:')) return undefined;

  const occurredAt = parsePaddleEventOccurredAt(params.providerEventOccurredAt);
  const providerEventId = params.providerEventId?.trim();
  if (!occurredAt || !providerEventId) {
    throw new PaddleEventOrderingError(
      `Signed provider event order evidence is missing or invalid for subscription ${params.providerSubscriptionId}`
    );
  }
  return { occurredAt, providerEventId, processingScopeKey: params.processingScopeKey };
}

/**
 * Locks the tenant-scoped subscription row and decides whether the incoming event
 * may write its snapshot. Must run inside the transaction that writes the snapshot,
 * so concurrent events for the aggregate serialize on the row lock.
 */
export async function lockSubscriptionEventOrder(
  tx: DomainEventTx,
  args: LockSubscriptionEventOrderArgs
): Promise<SubscriptionEventOrderDecision> {
  const occurredAt = sql`${args.order.occurredAt}::timestamptz`;
  // db-access-guard: tenant-scoped -- reason: tenantId from canonical Paddle context constrains the row lock.
  const [row] = await tx
    .select({
      status: subscriptions.status,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      providerEventId: subscriptions.providerEventId,
      comparison: sql<OrderComparison | null>`case
        when ${subscriptions.providerEventOccurredAt} is null then null
        when ${occurredAt} > ${subscriptions.providerEventOccurredAt} then 'newer'
        when ${occurredAt} = ${subscriptions.providerEventOccurredAt} then 'equal'
        else 'older' end`,
    })
    .from(subscriptions)
    .where(
      and(eq(subscriptions.id, args.subscriptionId), eq(subscriptions.tenantId, args.tenantId))
    )
    .for('update');
  if (!row) {
    throw new Error(
      `Paddle subscription ${args.providerSubscriptionId} update matched no tenant-scoped row`
    );
  }

  // A row holding another provider subscription is a new aggregate for this event;
  // markers from unrelated subscriptions are never compared.
  if (row.providerSubscriptionId !== args.providerSubscriptionId) {
    if (args.requireExactAggregate) {
      throw new Error(
        `Provider order integrity failed: row ${args.subscriptionId} does not hold subscription ${args.providerSubscriptionId}`
      );
    }
    return { kind: 'apply', fromStatus: row.status };
  }

  const comparison =
    row.comparison ?? (await compareWithReceiptLedger(tx, args, row.providerEventId));
  if (comparison === 'newer') return { kind: 'apply', fromStatus: row.status };
  if (comparison === 'equal') {
    if (row.providerEventId === args.order.providerEventId) return { kind: 'replayed' };
    throw new PaddleEventOrderingError(
      `Ambiguous provider event order for subscription ${args.providerSubscriptionId}: distinct events share occurred_at`
    );
  }
  return (await isSubscriptionEventRecorded(tx, args)) ? { kind: 'replayed' } : { kind: 'stale' };
}

/**
 * Rows without a marker predate ordered writes. Their floor is derived from verified
 * receipts of the same entity scope, tenant and provider subscription, so a missing
 * marker never fails open and unrelated scopes never become the floor.
 */
async function compareWithReceiptLedger(
  tx: DomainEventTx,
  args: LockSubscriptionEventOrderArgs,
  markerEventId: string | null
): Promise<OrderComparison> {
  if (markerEventId !== null) {
    throw new PaddleEventOrderingError(
      `Incomplete provider event order marker for subscription ${args.providerSubscriptionId}`
    );
  }
  const occurredAt = sql`${args.order.occurredAt}::timestamptz`;
  const receiptOccurredAt = sql`(${webhookEvents.payload} ->> 'occurred_at')`;
  const validReceipt = sql`coalesce(${receiptOccurredAt} ~ ${RECEIPT_OCCURRED_AT_PATTERN}, false)`;
  const receiptIsNewer = sql<boolean | null>`bool_or(
    case when ${validReceipt} then ${receiptOccurredAt}::timestamptz > ${occurredAt} else false end
  )`;
  const receiptIsEqual = sql<boolean | null>`bool_or(
    case when ${validReceipt} then ${receiptOccurredAt}::timestamptz = ${occurredAt} else false end
  )`;
  // db-access-guard: tenant-scoped -- reason: tenantId from canonical Paddle context constrains receipt ordering evidence.
  const [ledger] = await tx
    .select({
      hasInvalid: sql<boolean | null>`bool_or(not ${validReceipt})`,
      hasNewer: receiptIsNewer,
      hasEqual: receiptIsEqual,
    })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, 'paddle'),
        eq(webhookEvents.processingScopeKey, args.order.processingScopeKey),
        eq(webhookEvents.tenantId, args.tenantId),
        eq(webhookEvents.signatureValid, true),
        inArray(webhookEvents.eventType, SUBSCRIPTION_SNAPSHOT_EVENT_TYPES),
        sql`${webhookEvents.processingResult} is not null`,
        sql`${webhookEvents.payload} -> 'data' ->> 'id' = ${args.providerSubscriptionId}`,
        sql`${webhookEvents.eventId} is distinct from ${args.order.providerEventId}`
      )
    );
  if (ledger?.hasInvalid) {
    throw new PaddleEventOrderingError(
      `Verified receipt order evidence is invalid for subscription ${args.providerSubscriptionId}`
    );
  }
  if (ledger?.hasNewer) return 'older';
  if (ledger?.hasEqual) {
    throw new PaddleEventOrderingError(
      `Ambiguous provider event order for subscription ${args.providerSubscriptionId}: distinct events share occurred_at`
    );
  }
  return 'newer';
}

// An older event whose own snapshot was committed earlier (retry after a later
// step failed) is a replay: downstream idempotent effects may still complete.
async function isSubscriptionEventRecorded(
  tx: DomainEventTx,
  args: LockSubscriptionEventOrderArgs
): Promise<boolean> {
  if (!args.domainEventId) return false;
  // db-access-guard: tenant-scoped -- reason: tenantId from canonical Paddle context constrains the deterministic event lookup.
  const [recorded] = await tx
    .select({ id: domainEvents.id })
    .from(domainEvents)
    .where(and(eq(domainEvents.tenantId, args.tenantId), eq(domainEvents.id, args.domainEventId)))
    .limit(1);
  return Boolean(recorded);
}
