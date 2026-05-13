import { describe, expect, it, vi } from 'vitest';

import type { CrmOutboxAppendResult, CrmOutboxPort } from './repository';
import type {
  CreateCrmOutboxEventData,
  CrmDomainEvent,
  CrmLeadStageChangedEvent,
  CrmOutboxEvent,
} from './types';
import {
  createCrmOutboxEventData,
  enqueueCrmDomainEvent,
  enqueueCrmDomainEvents,
  validateCrmDomainEvent,
} from './mutations';

const now = '2026-05-13T10:00:00.000Z';

const services = {
  clock: { now: () => now },
  ids: { outboxEventId: vi.fn(() => 'outbox-1') },
};

function leadStageChangedEvent(
  overrides: Partial<CrmLeadStageChangedEvent> = {}
): CrmLeadStageChangedEvent {
  return {
    actor: {
      actorId: 'agent-1',
      branchId: 'branch-1',
      role: 'agent',
      tenantId: 'tenant-1',
    },
    aggregateId: 'lead-1',
    aggregateType: 'lead',
    occurredAt: '2026-05-13T09:59:00.000Z',
    payload: {
      branchId: 'branch-1',
      fromStage: 'new',
      leadId: 'lead-1',
      toStage: 'contacted',
    },
    tenantId: 'tenant-1',
    type: 'crm.lead.stage_changed',
    ...overrides,
  };
}

function toStoredEvent(event: CreateCrmOutboxEventData): CrmOutboxEvent {
  return {
    aggregateId: event.event.aggregateId,
    aggregateType: event.event.aggregateType,
    availableAt: event.availableAt,
    createdAt: now,
    event: event.event,
    id: event.id,
    idempotencyKey: event.idempotencyKey,
    retryCount: 0,
    status: 'pending',
    tenantId: event.event.tenantId,
    type: event.event.type,
  };
}

class InMemoryCrmOutbox implements CrmOutboxPort {
  readonly events: CrmOutboxEvent[] = [];

  async appendEvent(params: { event: CreateCrmOutboxEventData }): Promise<CrmOutboxAppendResult> {
    const existing = this.findDuplicate(params.event);
    if (existing) return { status: 'duplicate', outboxEvent: existing };
    const outboxEvent = toStoredEvent(params.event);
    this.events.push(outboxEvent);
    return { status: 'enqueued', outboxEvent };
  }

  async appendEvents(params: {
    events: readonly CreateCrmOutboxEventData[];
  }): Promise<readonly CrmOutboxAppendResult[]> {
    const results: CrmOutboxAppendResult[] = [];
    for (const event of params.events) {
      results.push(await this.appendEvent({ event }));
    }
    return results;
  }

  async claimPendingEvents(): Promise<readonly CrmOutboxEvent[]> {
    return this.events.filter(event => event.status === 'pending');
  }

  async markEventFailed(params: {
    eventId: string;
    error: string;
  }): Promise<CrmOutboxEvent | null> {
    const event = this.events.find(candidate => candidate.id === params.eventId);
    if (!event) return null;
    event.status = 'failed';
    event.lastError = params.error;
    event.retryCount += 1;
    return event;
  }

  async markEventPublished(params: {
    eventId: string;
    now: string;
  }): Promise<CrmOutboxEvent | null> {
    const event = this.events.find(candidate => candidate.id === params.eventId);
    if (!event) return null;
    event.status = 'published';
    event.publishedAt = params.now;
    return event;
  }

  private findDuplicate(event: CreateCrmOutboxEventData): CrmOutboxEvent | null {
    if (!event.idempotencyKey) return null;
    return (
      this.events.find(
        candidate =>
          candidate.tenantId === event.event.tenantId &&
          candidate.idempotencyKey === event.idempotencyKey
      ) ?? null
    );
  }
}

describe('CRM outbox', () => {
  it('builds deterministic outbox event data from a typed CRM domain event', () => {
    const event = createCrmOutboxEventData(
      {
        event: leadStageChangedEvent(),
        idempotencyKey: ' lead-stage:lead-1:contacted ',
      },
      services
    );

    expect(event).toEqual({
      availableAt: now,
      event: leadStageChangedEvent(),
      id: 'outbox-1',
      idempotencyKey: 'lead-stage:lead-1:contacted',
    });
  });

  it('rejects events that cannot be tenant scoped or replayed safely', () => {
    expect(validateCrmDomainEvent(leadStageChangedEvent({ tenantId: '' }))).toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'invalid_tenant',
    });
    expect(validateCrmDomainEvent(leadStageChangedEvent({ aggregateId: '' }))).toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'invalid_aggregate',
    });
    expect(
      validateCrmDomainEvent(
        leadStageChangedEvent({
          actor: { actorId: 'agent-1', role: 'agent', tenantId: 'tenant-2' },
        })
      )
    ).toEqual({ success: false, error: 'invalid_input', reason: 'actor_tenant_mismatch' });
    expect(validateCrmDomainEvent(leadStageChangedEvent({ occurredAt: 'not-a-date' }))).toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'invalid_occurred_at',
    });
  });

  it('enqueues through the outbox port and reports idempotent duplicates', async () => {
    const outbox = new InMemoryCrmOutbox();
    const input = {
      event: leadStageChangedEvent(),
      idempotencyKey: 'lead-stage:lead-1:contacted',
    };

    const first = await enqueueCrmDomainEvent(input, outbox, services);
    const second = await enqueueCrmDomainEvent(input, outbox, services);

    expect(first).toMatchObject({
      success: true,
      result: { status: 'enqueued' },
    });
    expect(second).toMatchObject({
      success: true,
      result: { status: 'duplicate' },
    });
    expect(outbox.events).toHaveLength(1);
  });

  it('does not partially append a batch when one event is invalid', async () => {
    const outbox = new InMemoryCrmOutbox();
    const result = await enqueueCrmDomainEvents(
      {
        events: [
          { event: leadStageChangedEvent(), idempotencyKey: 'valid' },
          { event: leadStageChangedEvent({ aggregateId: '' }), idempotencyKey: 'invalid' },
        ],
      },
      outbox,
      services
    );

    expect(result).toEqual({
      success: false,
      error: 'invalid_input',
      reason: 'invalid_aggregate',
    });
    expect(outbox.events).toHaveLength(0);
  });
});
