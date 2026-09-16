import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import postgres from 'postgres';

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
  it('formats the timestamptz column as UTC under a non-UTC database session', async t => {
    if (!process.env.DATABASE_URL) return t.skip('DATABASE_URL is required for relay SQL proof');
    const client = postgres(process.env.DATABASE_URL, { max: 1 });
    try {
      const [column] = await client<{ data_type: string }[]>`
        select data_type
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'domain_events'
          and column_name = 'created_at'
      `;
      assert.equal(column?.data_type, 'timestamp with time zone');
      await client.begin(async tx => {
        await tx`set local time zone 'Europe/Berlin'`;
        const [row] = await tx<{ created_at: string }[]>`
          select to_char(
            '2026-09-16T10:00:00.123456Z'::timestamptz at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ) as created_at
        `;
        assert.equal(row?.created_at, '2026-09-16T10:00:00.123456Z');
      });
    } finally {
      await client.end();
    }
  });

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
    assert.match(query, /to_char/);
    assert.match(query, /time zone/);
    assert.match(query, /for update skip locked/);
  });

  it('can narrow relay selection to one event family and version', async () => {
    const tx = new FakeSelectTx();

    await selectDomainEventsForRelay(tx as never, {
      consumerName: 'audit_projection',
      eventName: 'claim.status_changed',
      eventVersion: 1,
      limit: 10,
      tenantId: 'tenant-1',
    });

    const query = sqlText(tx.query).toLowerCase();
    assert.match(query, /event_name/);
    assert.match(query, /event_version/);
  });

  it('rejects blank event names before building the query', async () => {
    const tx = new FakeSelectTx();

    await assert.rejects(
      () =>
        selectDomainEventsForRelay(tx as never, {
          consumerName: 'audit_projection',
          eventName: '   ',
          limit: 10,
          tenantId: 'tenant-1',
        }),
      /eventName/
    );
    assert.equal(tx.query, undefined);
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

  it('normalizes selected driver timestamp strings without changing timezone meaning', async () => {
    const event = {
      createdAt: '2026-06-04 12:00:00.123456+02',
      id: 'event-1',
      tenantId: 'tenant-1',
    } as unknown as DomainEventRelayEvent;
    const tx = { execute: async () => [event] };

    const selected = await selectDomainEventsForRelay(tx as never, {
      consumerName: 'audit_projection',
      limit: 1,
      tenantId: 'tenant-1',
    });

    assert.equal(selected[0].createdAt instanceof Date, true);
    assert.equal(selected[0].createdAt.toISOString(), '2026-06-04T10:00:00.123Z');
  });

  it('accepts compact and colon offsets from PostgreSQL without local-time inference', async () => {
    for (const [createdAt, expected] of [
      ['2026-06-04 12:00:00.123+0200', '2026-06-04T10:00:00.123Z'],
      ['2026-06-04 12:00:00.123+02:30', '2026-06-04T09:30:00.123Z'],
      ['2026-06-04 10:00:00.123+00', '2026-06-04T10:00:00.123Z'],
    ] as const) {
      const selected = await selectDomainEventsForRelay(
        { execute: async () => [{ createdAt, id: 'event-1', tenantId: 'tenant-1' }] } as never,
        { consumerName: 'audit_projection', limit: 1, tenantId: 'tenant-1' }
      );
      assert.equal(selected[0].createdAt.toISOString(), expected);
    }
  });

  it('accepts canonical T/Z input and truncates microseconds explicitly', async () => {
    const selected = await selectDomainEventsForRelay(
      {
        execute: async () => [
          { createdAt: '2026-06-04T10:00:00.987654Z', id: 'event-1', tenantId: 'tenant-1' },
        ],
      } as never,
      { consumerName: 'audit_projection', limit: 1, tenantId: 'tenant-1' }
    );
    assert.equal(selected[0].createdAt.toISOString(), '2026-06-04T10:00:00.987Z');
  });

  it('preserves native dates and rejects ambiguous or invalid driver timestamps', async () => {
    const createdAt = new Date('2026-06-04T10:00:00.000Z');
    const native = await selectDomainEventsForRelay(
      { execute: async () => [{ createdAt, id: 'event-1', tenantId: 'tenant-1' }] } as never,
      { consumerName: 'audit_projection', limit: 1, tenantId: 'tenant-1' }
    );
    assert.equal(native[0].createdAt, createdAt);

    await assert.rejects(
      () =>
        selectDomainEventsForRelay(
          {
            execute: async () => [
              { createdAt: '2026-99-99 10:00:00+00', id: 'event-2', tenantId: 'tenant-1' },
            ],
          } as never,
          { consumerName: 'audit_projection', limit: 1, tenantId: 'tenant-1' }
        ),
      /valid createdAt/
    );

    await assert.rejects(
      () =>
        selectDomainEventsForRelay(
          {
            execute: async () => [
              { createdAt: '2026-06-04 10:00:00.123', id: 'event-3', tenantId: 'tenant-1' },
            ],
          } as never,
          { consumerName: 'audit_projection', limit: 1, tenantId: 'tenant-1' }
        ),
      /explicit-offset createdAt/
    );
  });
});
