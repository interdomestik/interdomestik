import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendEvent, type DomainEventTx } from '../src/domain-events';
import { domainEvents } from '../src/schema/domain-events';

type InsertedRow = Record<string, unknown>;

class FakeInsertStep {
  constructor(
    private readonly capture: { row?: InsertedRow; table?: unknown },
    private readonly table: unknown
  ) {}

  values(row: InsertedRow) {
    this.capture.row = row;
    this.capture.table = this.table;
    return { returning: () => [{ id: row.id }] };
  }
}

class FakeTx {
  constructor(private readonly capture: { row?: InsertedRow; table?: unknown }) {}

  insert(table: unknown) {
    return new FakeInsertStep(this.capture, table);
  }
}

function makeTx() {
  const capture: { row?: InsertedRow; table?: unknown } = {};
  return { capture, tx: new FakeTx(capture) as unknown as DomainEventTx };
}

describe('appendEvent', () => {
  it('writes a domain event through the caller-owned transaction', async () => {
    const { capture, tx } = makeTx();
    const createdAt = new Date('2026-06-03T20:00:00.000Z');

    const result = await appendEvent(tx, {
      actor: { id: 'staff-1', role: 'staff' },
      aggregateVersion: 7,
      correlationId: 'corr-1',
      createdAt,
      entity: { id: 'claim-1', type: 'claim' },
      eventName: 'claim.status_changed',
      eventVersion: 1,
      hostId: 'tenant_ks',
      id: 'event-1',
      payload: { fromStatus: 'draft', toStatus: 'submitted' },
      tenantId: 'tenant-1',
    });

    assert.deepEqual(result, { id: 'event-1' });
    assert.equal(capture.table, domainEvents);
    assert.deepEqual(capture.row, {
      id: 'event-1',
      tenantId: 'tenant-1',
      actorId: 'staff-1',
      actorRole: 'staff',
      entityType: 'claim',
      entityId: 'claim-1',
      eventName: 'claim.status_changed',
      eventVersion: 1,
      hostId: 'tenant_ks',
      aggregateVersion: 7,
      correlationId: 'corr-1',
      payload: { fromStatus: 'draft', toStatus: 'submitted' },
      createdAt,
    });
  });

  it('rejects invalid event versions before inserting', async () => {
    const { capture, tx } = makeTx();

    await assert.rejects(
      () =>
        appendEvent(tx, {
          actor: { id: 'staff-1', role: 'staff' },
          aggregateVersion: 0,
          correlationId: 'corr-1',
          entity: { id: 'claim-1', type: 'claim' },
          eventName: 'claim.status_changed',
          eventVersion: 0,
          tenantId: 'tenant-1',
        }),
      /eventVersion >= 1/
    );
    assert.equal(capture.row, undefined);
  });

  it('rejects non-allowlisted host telemetry before inserting', async () => {
    const { capture, tx } = makeTx();

    await assert.rejects(
      () =>
        appendEvent(tx, {
          actor: { id: 'staff-1', role: 'staff' },
          aggregateVersion: 1,
          correlationId: 'corr-1',
          entity: { id: 'claim-1', type: 'claim' },
          eventName: 'claim.status_changed',
          eventVersion: 1,
          hostId: 'attacker.test',
          payload: { fromStatus: 'draft', toStatus: 'submitted' },
          tenantId: 'tenant-1',
        }),
      /hostId to be allowlisted/
    );
    assert.equal(capture.row, undefined);
  });

  it('lets the database default createdAt when no timestamp is supplied', async () => {
    const { capture, tx } = makeTx();

    await appendEvent(tx, {
      actor: { id: 'staff-1', role: 'staff' },
      aggregateVersion: 1,
      correlationId: 'corr-1',
      entity: { id: 'claim-1', type: 'claim' },
      eventName: 'claim.status_changed',
      eventVersion: 1,
      id: 'event-2',
      payload: { fromStatus: 'draft', toStatus: 'submitted' },
      tenantId: 'tenant-1',
    });

    assert.equal(Object.hasOwn(capture.row ?? {}, 'createdAt'), false);
  });
});
