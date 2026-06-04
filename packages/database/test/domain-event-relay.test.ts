import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  domainEventDeliveryIdempotencyKey,
  recordDomainEventDelivery,
  relayDomainEvents,
  type DomainEventRelayEvent,
} from '../src/domain-event-relay';
import { type DomainEventTx } from '../src/domain-events';
import { domainEventDeliveries } from '../src/schema/domain-event-deliveries';

const event = {
  actorId: 'staff-1',
  actorRole: 'staff',
  aggregateVersion: 1,
  correlationId: 'corr-1',
  createdAt: new Date('2026-06-04T10:00:00.000Z'),
  entityId: 'claim-1',
  entityType: 'claim',
  eventName: 'claim.status_changed',
  eventVersion: 1,
  id: 'event-1',
  payload: { fromStatus: 'draft', toStatus: 'submitted' },
  tenantId: 'tenant-1',
} satisfies DomainEventRelayEvent;

class FakeInsertStep {
  constructor(
    private readonly capture: {
      conflict?: unknown;
      row?: Record<string, unknown>;
      table?: unknown;
    },
    private readonly conflict: boolean
  ) {}

  values(row: Record<string, unknown>) {
    this.capture.row = row;
    return {
      onConflictDoNothing: (conflict: unknown) => {
        this.capture.conflict = conflict;
        return { returning: () => (this.conflict ? [] : [{ id: row.id }]) };
      },
    };
  }
}

class FakeRelayTx {
  readonly capture: { conflict?: unknown; row?: Record<string, unknown>; table?: unknown } = {};
  query?: unknown;

  constructor(
    private readonly rows: DomainEventRelayEvent[],
    private readonly conflict = false
  ) {}

  execute<T>(query: unknown) {
    this.query = query;
    return Promise.resolve(this.rows as T[]);
  }

  insert(table: unknown) {
    this.capture.table = table;
    return new FakeInsertStep(this.capture, this.conflict);
  }
}

describe('domain event relay foundation', () => {
  it('uses stable event-consumer idempotency keys', () => {
    assert.equal(
      domainEventDeliveryIdempotencyKey('event-1', 'audit_projection'),
      'domain-event:audit_projection:event-1'
    );
  });

  it('records per-consumer delivery once and treats conflict as idempotent redelivery', async () => {
    const tx = new FakeRelayTx([], true) as unknown as DomainEventTx;
    const result = await recordDomainEventDelivery(tx, {
      consumerName: 'audit_projection',
      eventId: 'event-1',
      id: 'delivery-1',
      tenantId: 'tenant-1',
    });

    assert.equal(result.status, 'already_delivered');
    assert.equal(result.idempotencyKey, 'domain-event:audit_projection:event-1');
    assert.equal((tx as unknown as FakeRelayTx).capture.table, domainEventDeliveries);
  });

  it('rejects blank caller-provided delivery ids before insert', async () => {
    const tx = new FakeRelayTx([]) as unknown as DomainEventTx;

    await assert.rejects(
      () =>
        recordDomainEventDelivery(tx, {
          consumerName: 'audit_projection',
          eventId: 'event-1',
          id: '   ',
          tenantId: 'tenant-1',
        }),
      /delivery\.id/
    );
  });

  it('counts relay-level delivery record conflicts without hiding consumer invocation', async () => {
    const tx = new FakeRelayTx([event], true);

    const result = await relayDomainEvents(tx as never, {
      consumer: { name: 'audit_projection', deliver: async () => {} },
      limit: 10,
      tenantId: 'tenant-1',
    });

    assert.deepEqual(result, {
      consumerInvocations: 1,
      deliveryRecordsAlreadyExisted: 1,
      deliveryRecordsCreated: 0,
      selected: 1,
    });
  });

  it('delivers selected events and passes the stable idempotency key to the consumer', async () => {
    const tx = new FakeRelayTx([event]);
    const delivered: Array<{ eventId: string; idempotencyKey: string }> = [];

    const result = await relayDomainEvents(tx as never, {
      consumer: {
        name: 'audit_projection',
        deliver: async (relayEvent, delivery) => {
          delivered.push({ eventId: relayEvent.id, idempotencyKey: delivery.idempotencyKey });
        },
      },
      limit: 10,
      tenantId: 'tenant-1',
    });

    assert.deepEqual(result, {
      consumerInvocations: 1,
      deliveryRecordsAlreadyExisted: 0,
      deliveryRecordsCreated: 1,
      selected: 1,
    });
    assert.deepEqual(delivered, [
      { eventId: 'event-1', idempotencyKey: 'domain-event:audit_projection:event-1' },
    ]);
    assert.equal(tx.capture.row?.tenantId, 'tenant-1');
  });
});
