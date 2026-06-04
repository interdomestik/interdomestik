import { sql } from 'drizzle-orm';

import { domainEventDeliveryIdempotencyKey } from './domain-event-delivery-keys';
import { recordDomainEventDelivery } from './domain-event-delivery-recording';
import { type DomainEventTx } from './domain-events';
import type {
  DomainEventRelayEvent,
  RelayDomainEventsParams,
  RelayDomainEventsResult,
} from './domain-event-relay-types';

export type {
  DomainEventRelayConsumer,
  DomainEventRelayEvent,
  RelayDomainEventsParams,
  RelayDomainEventsResult,
  RelayMode,
} from './domain-event-relay-types';
export { recordDomainEventDelivery } from './domain-event-delivery-recording';
export { domainEventDeliveryIdempotencyKey } from './domain-event-delivery-keys';

type RelayTx = DomainEventTx & {
  execute<T>(query: unknown): Promise<T[]>;
};

function assertNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`domain event relay requires ${field}`);
  return normalized;
}

function assertLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('domain event relay requires limit between 1 and 100');
  }
  return limit;
}

export async function selectDomainEventsForRelay(
  tx: RelayTx,
  params: Omit<RelayDomainEventsParams, 'consumer'> & { consumerName: string }
): Promise<DomainEventRelayEvent[]> {
  const consumerName = assertNonBlank(params.consumerName, 'consumer.name');
  const tenantId = assertNonBlank(params.tenantId, 'tenantId');
  const limit = assertLimit(params.limit);
  const replayFrom = params.replayFrom;
  const mode = params.mode ?? 'undelivered';
  const eventNameFilter =
    params.eventName !== undefined
      ? sql`and e."event_name" = ${assertNonBlank(params.eventName, 'eventName')}`
      : sql``;
  if (
    params.eventVersion !== undefined &&
    (!Number.isInteger(params.eventVersion) || params.eventVersion < 1)
  ) {
    throw new Error('domain event relay requires eventVersion >= 1');
  }
  const eventVersionFilter = params.eventVersion
    ? sql`and e."event_version" = ${params.eventVersion}`
    : sql``;
  const deliveryFilter =
    mode === 'replay'
      ? sql``
      : sql`and not exists (
          select 1 from "domain_event_deliveries" d
          where d."event_id" = e."id" and d."consumer_name" = ${consumerName}
        )`;
  const offsetFilter = replayFrom
    ? sql`and (
        e."created_at" > ${replayFrom.createdAt}
        or (e."created_at" = ${replayFrom.createdAt} and e."id" >= ${
          replayFrom.eventId ? assertNonBlank(replayFrom.eventId, 'replayFrom.eventId') : ''
        })
      )`
    : sql``;
  const lockClause = mode === 'replay' ? sql`` : sql`for update skip locked`;
  return tx.execute<DomainEventRelayEvent>(sql`
    select
      e."id",
      e."tenant_id" as "tenantId",
      e."actor_id" as "actorId",
      e."actor_role" as "actorRole",
      e."entity_type" as "entityType",
      e."entity_id" as "entityId",
      e."event_name" as "eventName",
      e."event_version" as "eventVersion",
      e."aggregate_version" as "aggregateVersion",
      e."correlation_id" as "correlationId",
      e."payload",
      e."created_at" as "createdAt"
    from "domain_events" e
    where 1 = 1
    and e."tenant_id" = ${tenantId}
    ${eventNameFilter}
    ${eventVersionFilter}
    ${deliveryFilter}
    ${offsetFilter}
    order by e."created_at" asc, e."id" asc
    limit ${limit}
    ${lockClause}
  `);
}

export async function relayDomainEvents(
  tx: RelayTx,
  params: RelayDomainEventsParams
): Promise<RelayDomainEventsResult> {
  const consumerName = assertNonBlank(params.consumer.name, 'consumer.name');
  const tenantId = assertNonBlank(params.tenantId, 'tenantId');
  const events = await selectDomainEventsForRelay(tx, { ...params, consumerName });
  let consumerInvocations = 0;
  let deliveryRecordsAlreadyExisted = 0;
  let deliveryRecordsCreated = 0;

  for (const event of events) {
    const idempotencyKey = domainEventDeliveryIdempotencyKey(event.id, consumerName);
    await params.consumer.deliver(event, { idempotencyKey });
    consumerInvocations += 1;
    const result = await recordDomainEventDelivery(tx, {
      consumerName,
      eventId: event.id,
      tenantId,
    });
    if (result.status === 'delivered') deliveryRecordsCreated += 1;
    else deliveryRecordsAlreadyExisted += 1;
  }

  return {
    consumerInvocations,
    deliveryRecordsAlreadyExisted,
    deliveryRecordsCreated,
    selected: events.length,
  };
}
