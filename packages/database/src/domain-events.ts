import { domainEvents } from './schema/domain-events';
import { db } from './db';

export type DomainEventTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AppendEventParams = {
  actor: {
    id: string;
    role: string;
  };
  aggregateVersion: number;
  correlationId: string;
  createdAt?: Date;
  entity: {
    id: string;
    type: string;
  };
  eventName: string;
  eventVersion: number;
  id?: string;
  payload?: Record<string, unknown>;
  tenantId: string;
};

export type AppendEventResult = {
  id: string;
};

function assertNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`appendEvent requires ${field}`);
  }
}

function assertIntegerAtLeast(value: number, minimum: number, field: string): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`appendEvent requires ${field} >= ${minimum}`);
  }
}

export async function appendEvent(
  tx: DomainEventTx,
  params: AppendEventParams
): Promise<AppendEventResult> {
  const eventId = params.id ?? crypto.randomUUID();

  assertNonEmpty(eventId, 'id');
  assertNonEmpty(params.tenantId, 'tenantId');
  assertNonEmpty(params.actor.id, 'actor.id');
  assertNonEmpty(params.actor.role, 'actor.role');
  assertNonEmpty(params.entity.type, 'entity.type');
  assertNonEmpty(params.entity.id, 'entity.id');
  assertNonEmpty(params.eventName, 'eventName');
  assertNonEmpty(params.correlationId, 'correlationId');
  assertIntegerAtLeast(params.eventVersion, 1, 'eventVersion');
  assertIntegerAtLeast(params.aggregateVersion, 0, 'aggregateVersion');

  const [row] = await tx
    .insert(domainEvents)
    .values({
      id: eventId,
      tenantId: params.tenantId,
      actorId: params.actor.id,
      actorRole: params.actor.role,
      entityType: params.entity.type,
      entityId: params.entity.id,
      eventName: params.eventName,
      eventVersion: params.eventVersion,
      aggregateVersion: params.aggregateVersion,
      correlationId: params.correlationId,
      payload: params.payload ?? {},
      ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    })
    .returning({ id: domainEvents.id });

  return { id: row?.id ?? eventId };
}
