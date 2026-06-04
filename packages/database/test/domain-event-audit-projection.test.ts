import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  projectClaimStatusChangedAuditEvent,
  relayClaimStatusAuditProjectionEvents,
  type DomainEventRelayEvent,
  type DomainEventTx,
} from '../src';
import { auditLog, domainEventDeliveries } from '../src/schema';

const event = {
  actorId: 'staff-1',
  actorRole: 'staff',
  aggregateVersion: 2,
  correlationId: 'corr-1',
  createdAt: new Date('2026-06-04T13:00:00.000Z'),
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
    private readonly tx: FakeProjectionTx,
    private readonly table: unknown
  ) {}

  values(row: Record<string, unknown>) {
    if (this.tx.failAuditInsert && this.table === auditLog) {
      throw new Error('audit sink unavailable');
    }
    if (this.table === auditLog) this.tx.auditRows.push(row);
    if (this.table === domainEventDeliveries) this.tx.deliveryRows.push(row);
    return {
      onConflictDoNothing: () => ({
        returning: () => (this.tx.conflict ? [] : [{ id: row.id }]),
      }),
    };
  }
}

class FakeProjectionTx {
  auditRows: Record<string, unknown>[] = [];
  deliveryRows: Record<string, unknown>[] = [];

  constructor(
    private readonly rows: DomainEventRelayEvent[] = [],
    readonly conflict = false,
    readonly failAuditInsert = false
  ) {}

  execute<T>() {
    return Promise.resolve(this.rows as T[]);
  }

  insert(table: unknown) {
    return new FakeInsertStep(this, table);
  }
}

describe('claim status audit projection consumer', () => {
  it('projects claim.status_changed events into deterministic tenant audit rows', async () => {
    const tx = new FakeProjectionTx();

    const result = await projectClaimStatusChangedAuditEvent(
      tx as unknown as DomainEventTx,
      event,
      {
        idempotencyKey: 'domain-event:audit_projection:event-1',
      }
    );

    assert.deepEqual(result, {
      auditLogId: 'domain-event-audit:event-1',
      status: 'projected',
    });
    assert.equal(tx.auditRows[0].id, 'domain-event-audit:event-1');
    assert.equal(tx.auditRows[0].tenantId, 'tenant-1');
    assert.equal(tx.auditRows[0].action, 'claim.status_changed');
    assert.equal(Object.hasOwn(tx.auditRows[0], 'createdAt'), false);
    assert.deepEqual(tx.auditRows[0].metadata, {
      aggregateVersion: 2,
      correlationId: 'corr-1',
      eventId: 'event-1',
      eventCreatedAt: '2026-06-04T13:00:00.000Z',
      eventName: 'claim.status_changed',
      eventVersion: 1,
      fromStatus: 'draft',
      idempotencyKey: 'domain-event:audit_projection:event-1',
      projection: 'audit_projection',
      toStatus: 'submitted',
    });
  });

  it('treats repeated projection inserts as idempotent', async () => {
    const tx = new FakeProjectionTx([], true);

    const result = await projectClaimStatusChangedAuditEvent(
      tx as unknown as DomainEventTx,
      event,
      {
        idempotencyKey: 'domain-event:audit_projection:event-1',
      }
    );

    assert.equal(result.status, 'already_projected');
    assert.equal(tx.auditRows[0].id, 'domain-event-audit:event-1');
  });

  it('records delivery only after the audit projection succeeds', async () => {
    const tx = new FakeProjectionTx([event], false, true);

    await assert.rejects(
      () => relayClaimStatusAuditProjectionEvents(tx as never, { limit: 10, tenantId: 'tenant-1' }),
      /audit sink unavailable/
    );
    assert.equal(tx.deliveryRows.length, 0);
  });

  it('rejects unsupported event families before inserting an audit row', async () => {
    const tx = new FakeProjectionTx();

    await assert.rejects(
      () =>
        projectClaimStatusChangedAuditEvent(
          tx as unknown as DomainEventTx,
          { ...event, eventName: 'case.created' },
          { idempotencyKey: 'domain-event:audit_projection:event-1' }
        ),
      /claim\.status_changed@1/
    );
    assert.equal(tx.auditRows.length, 0);
  });
});
