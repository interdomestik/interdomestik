import type { TenantTransaction } from '@interdomestik/database';
import { notificationDeliveries as deliveries } from '@interdomestik/database/schema';
import { notificationDeliveryKey, type EnqueueDelivery } from './keys';

function deliveryValues(input: EnqueueDelivery) {
  return {
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
  };
}

export async function enqueueNotificationDelivery(tx: TenantTransaction, input: EnqueueDelivery) {
  const [row] = await tx
    .insert(deliveries)
    .values(deliveryValues(input))
    .onConflictDoNothing({ target: [deliveries.tenantId, deliveries.idempotencyKey] })
    .returning({ id: deliveries.id });
  return row?.id ?? null;
}

/**
 * Rows per multi-row INSERT. Inbox and delivery rows bind at most ten values each, so one
 * statement stays far below PostgreSQL's 65,535 bind parameters and the builder's recursion.
 */
export const INSERT_BATCH_ROWS = 1000;

/**
 * Enqueues deliveries in multi-row statements of at most `INSERT_BATCH_ROWS` rows. Each row keeps
 * its own idempotency key and conflict handling; the result lists newly queued ids in input order.
 */
export async function enqueueNotificationDeliveries(
  tx: TenantTransaction,
  inputs: readonly EnqueueDelivery[]
): Promise<string[]> {
  return insertDeliveryBatches(tx, inputs, 0);
}

// Recursion, not a loop with a callback: each batch awaits the previous one and the transaction
// stays a parameter, never a captured variable.
async function insertDeliveryBatches(
  tx: TenantTransaction,
  inputs: readonly EnqueueDelivery[],
  from: number
): Promise<string[]> {
  const batch = inputs.slice(from, from + INSERT_BATCH_ROWS);
  if (batch.length === 0) return [];
  const rows = await tx
    .insert(deliveries)
    .values(batch.map(deliveryValues))
    .onConflictDoNothing({ target: [deliveries.tenantId, deliveries.idempotencyKey] })
    .returning({ id: deliveries.id });
  const queued = new Set(rows.map(row => row.id));
  const ids = batch.filter(input => queued.has(input.id)).map(input => input.id);
  const rest = await insertDeliveryBatches(tx, inputs, from + INSERT_BATCH_ROWS);
  return ids.concat(rest);
}
