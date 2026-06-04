import type { DomainEventTx } from './domain-events';
import { domainEventDeliveryIdempotencyKey } from './domain-event-delivery-keys';
import { domainEventDeliveries } from './schema/domain-event-deliveries';

function assertNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`domain event relay requires ${field}`);
  return normalized;
}

export async function recordDomainEventDelivery(
  tx: DomainEventTx,
  params: { consumerName: string; eventId: string; id?: string; tenantId: string }
): Promise<{
  id: string | null;
  idempotencyKey: string;
  status: 'delivered' | 'already_delivered';
}> {
  const consumerName = assertNonBlank(params.consumerName, 'consumer.name');
  const deliveryId =
    params.id === undefined ? crypto.randomUUID() : assertNonBlank(params.id, 'delivery.id');
  const idempotencyKey = domainEventDeliveryIdempotencyKey(params.eventId, consumerName);
  const [row] = await tx
    .insert(domainEventDeliveries)
    .values({
      id: deliveryId,
      tenantId: assertNonBlank(params.tenantId, 'tenantId'),
      eventId: assertNonBlank(params.eventId, 'event.id'),
      consumerName,
      idempotencyKey,
    })
    .onConflictDoNothing({
      target: [domainEventDeliveries.eventId, domainEventDeliveries.consumerName],
    })
    .returning({ id: domainEventDeliveries.id });

  return { id: row?.id ?? null, idempotencyKey, status: row ? 'delivered' : 'already_delivered' };
}
