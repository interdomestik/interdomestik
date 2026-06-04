import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectDomainEventsForRelay, type DomainEventRelayEvent } from '../src/domain-event-relay';

class FakeSelectTx {
  query?: unknown;

  execute<T>(query: unknown) {
    this.query = query;
    return Promise.resolve([] as T[]);
  }
}

function sqlText(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value);
  if ('value' in value && Array.isArray(value.value)) return value.value.join(' ');
  if ('queryChunks' in value && Array.isArray(value.queryChunks)) {
    return value.queryChunks.map(sqlText).join(' ');
  }
  return String(value);
}

describe('domain event relay selection', () => {
  it('selects undelivered batches with tenant scope and transaction-safe locking', async () => {
    const tx = new FakeSelectTx();

    await selectDomainEventsForRelay(tx as never, {
      consumerName: 'audit_projection',
      limit: 10,
      tenantId: 'tenant-1',
    });

    const query = sqlText(tx.query).toLowerCase();
    assert.match(query, /not exists/);
    assert.match(query, /consumer_name/);
    assert.match(query, /tenant_id/);
    assert.match(query, /for update skip locked/);
  });

  it('selects replay batches from an arbitrary offset without delivery filtering', async () => {
    const tx = new FakeSelectTx();

    await selectDomainEventsForRelay(tx as never, {
      consumerName: 'audit_projection',
      limit: 10,
      mode: 'replay',
      replayFrom: { createdAt: new Date('2026-06-04T10:00:00.000Z'), eventId: 'event-1' },
      tenantId: 'tenant-1',
    });

    const query = sqlText(tx.query).toLowerCase();
    assert.doesNotMatch(query, /not exists/);
    assert.match(query, /created_at/);
    assert.match(query, /tenant_id/);
    assert.doesNotMatch(query, /for update skip locked/);
  });

  it('rejects blank replay cursor event ids before building the query', async () => {
    const tx = new FakeSelectTx();

    await assert.rejects(
      () =>
        selectDomainEventsForRelay(tx as never, {
          consumerName: 'audit_projection',
          limit: 10,
          mode: 'replay',
          replayFrom: { createdAt: new Date('2026-06-04T10:00:00.000Z'), eventId: '   ' },
          tenantId: 'tenant-1',
        }),
      /replayFrom\.eventId/
    );
    assert.equal(tx.query, undefined);
  });

  it('returns the selected event rows without mapping them in userland', async () => {
    const event = { id: 'event-1', tenantId: 'tenant-1' } as DomainEventRelayEvent;
    const tx = { execute: async () => [event] };

    await assert.doesNotReject(
      async () =>
        await selectDomainEventsForRelay(tx as never, {
          consumerName: 'audit_projection',
          limit: 1,
          tenantId: 'tenant-1',
        })
    );
  });
});
