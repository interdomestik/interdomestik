import type { CrmOutboxAppendResult, CrmOutboxPort } from './repository';
import {
  CRM_DOMAIN_EVENT_AGGREGATE_TYPES,
  CRM_DOMAIN_EVENT_TYPES,
  type CreateCrmOutboxEventData,
  type CrmDomainEvent,
  type CrmDomainEventAggregateType,
  type CrmDomainEventType,
} from './types';

export type CrmOutboxClock = {
  now(): string;
};

export type CrmOutboxIds = {
  outboxEventId(): string;
};

export type EnqueueCrmDomainEventInput<TEvent extends CrmDomainEvent = CrmDomainEvent> = {
  availableAt?: string | null;
  event: TEvent;
  idempotencyKey?: string | null;
};

export type EnqueueCrmDomainEventResult =
  | { success: true; result: CrmOutboxAppendResult }
  | {
      success: false;
      error: 'invalid_input';
      reason:
        | 'actor_tenant_mismatch'
        | 'invalid_aggregate'
        | 'invalid_available_at'
        | 'invalid_event_type'
        | 'invalid_occurred_at'
        | 'invalid_tenant';
    };

type InvalidCrmDomainEventResult = Exclude<EnqueueCrmDomainEventResult, { success: true }>;

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function isParseableDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

function isCrmDomainEventType(value: string): value is CrmDomainEventType {
  return CRM_DOMAIN_EVENT_TYPES.includes(value as CrmDomainEventType);
}

function isCrmDomainEventAggregateType(value: string): value is CrmDomainEventAggregateType {
  return CRM_DOMAIN_EVENT_AGGREGATE_TYPES.includes(value as CrmDomainEventAggregateType);
}

export function validateCrmDomainEvent(event: CrmDomainEvent): InvalidCrmDomainEventResult | null {
  if (!isCrmDomainEventType(event.type)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_event_type' };
  }
  if (!isCrmDomainEventAggregateType(event.aggregateType) || !isNonEmptyString(event.aggregateId)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_aggregate' };
  }
  if (!isNonEmptyString(event.tenantId)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_tenant' };
  }
  if (event.actor && event.actor.tenantId !== event.tenantId) {
    return { success: false, error: 'invalid_input', reason: 'actor_tenant_mismatch' };
  }
  if (!isParseableDate(event.occurredAt)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_occurred_at' };
  }
  return null;
}

export function createCrmOutboxEventData<TEvent extends CrmDomainEvent>(
  input: EnqueueCrmDomainEventInput<TEvent>,
  services: { clock: CrmOutboxClock; ids: CrmOutboxIds }
): CreateCrmOutboxEventData<TEvent> | InvalidCrmDomainEventResult {
  const denied = validateCrmDomainEvent(input.event);
  if (denied) return denied;
  const availableAt = input.availableAt ?? services.clock.now();
  if (!isParseableDate(availableAt)) {
    return { success: false, error: 'invalid_input', reason: 'invalid_available_at' };
  }
  return {
    availableAt,
    event: input.event,
    id: services.ids.outboxEventId(),
    idempotencyKey: input.idempotencyKey?.trim() || null,
  };
}

export async function enqueueCrmDomainEvent<TEvent extends CrmDomainEvent>(
  input: EnqueueCrmDomainEventInput<TEvent>,
  outbox: Pick<CrmOutboxPort, 'appendEvent'>,
  services: { clock: CrmOutboxClock; ids: CrmOutboxIds }
): Promise<EnqueueCrmDomainEventResult> {
  const event = createCrmOutboxEventData(input, services);
  if ('success' in event) return event;
  const result = await outbox.appendEvent({ event });
  return { success: true, result };
}

export async function enqueueCrmDomainEvents(
  input: { events: readonly EnqueueCrmDomainEventInput[] },
  outbox: Pick<CrmOutboxPort, 'appendEvents'>,
  services: { clock: CrmOutboxClock; ids: CrmOutboxIds }
): Promise<
  { success: true; results: readonly CrmOutboxAppendResult[] } | InvalidCrmDomainEventResult
> {
  const events: CreateCrmOutboxEventData[] = [];
  for (const eventInput of input.events) {
    const event = createCrmOutboxEventData(eventInput, services);
    if ('success' in event) return event;
    events.push(event);
  }
  const results = await outbox.appendEvents({ events });
  return { success: true, results };
}
