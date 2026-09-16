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

type RelayTx = DomainEventTx;
type DomainEventRelayRow = Omit<DomainEventRelayEvent, 'createdAt'> & {
  createdAt: Date | string;
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

function normalizeCreatedAt(value: Date | string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('domain event relay requires a valid createdAt');
    }
    return value;
  }
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(
      value
    );
  if (!match) throw new Error('domain event relay requires an explicit-offset createdAt');
  const rawOffset = match[4];
  const offset =
    rawOffset === 'Z'
      ? rawOffset
      : rawOffset.length === 3
        ? `${rawOffset}:00`
        : rawOffset.length === 5
          ? `${rawOffset.slice(0, 3)}:${rawOffset.slice(3)}`
          : rawOffset;
  const milliseconds = (match[3] ?? '').padEnd(3, '0').slice(0, 3);
  const createdAt = new Date(`${match[1]}T${match[2]}.${milliseconds}${offset}`);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error('domain event relay requires a valid createdAt');
  }
  return createdAt;
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
  const replayFromEventId = replayFrom?.eventId
    ? assertNonBlank(replayFrom.eventId, 'replayFrom.eventId')
    : '';
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
        or (e."created_at" = ${replayFrom.createdAt} and e."id" >= ${replayFromEventId})
      )`
    : sql``;
  const lockClause = mode === 'replay' ? sql`` : sql`for update skip locked`;
  const rows = await tx.execute<DomainEventRelayRow>(sql`
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
      to_char(
        e."created_at" at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) as "createdAt"
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
  if (!Array.isArray(rows)) throw new Error('domain event relay requires a row-array result');
  return rows.map(row => ({ ...row, createdAt: normalizeCreatedAt(row.createdAt) }));
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
