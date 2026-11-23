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
 * Enqueues several deliveries in one statement. Each row keeps its own idempotency key and
 * conflict handling; the result lists the newly queued ids in input order.
 */
export async function enqueueNotificationDeliveries(
  tx: TenantTransaction,
  inputs: readonly EnqueueDelivery[]
): Promise<string[]> {
  if (inputs.length === 0) return [];
  const rows = await tx
    .insert(deliveries)
    .values(inputs.map(deliveryValues))
    .onConflictDoNothing({ target: [deliveries.tenantId, deliveries.idempotencyKey] })
    .returning({ id: deliveries.id });
  const queued = new Set(rows.map(row => row.id));
  return inputs.filter(input => queued.has(input.id)).map(input => input.id);
}
