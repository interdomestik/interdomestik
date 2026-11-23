import { beforeEach, describe, expect, it } from 'vitest';
import {
  ids,
  reset,
  state,
  tables,
  withTenantContext,
} from './public-reply-notification-flow.fixture';

const scope = { tenantId: ids.tenant };
// Complete rows: every NOT NULL column without a default is set, against the seeded claim and users.
const inbox = (id: string) => ({
  id,
  tenantId: ids.tenant,
  userId: ids.staff,
  type: 'staff_member_message',
  title: '—',
  content: 'other',
});
const delivery = (id: string, idempotencyKey: string) => ({
  id,
  tenantId: ids.tenant,
  idempotencyKey,
  kind: 'staff_member_message',
  channel: 'email',
  recipientUserId: ids.staff,
  claimId: ids.claim,
  facts: {},
});
const message = (id: string) => ({
  id,
  tenantId: ids.tenant,
  claimId: ids.claim,
  senderId: ids.member,
  content: 'Synthetic public reply',
});

describe('reply-flow fixture insert model', () => {
  beforeEach(() => reset('restricted'));

  it('refuses a statement that repeats an id within itself, without writing any row', async () => {
    await expect(
      withTenantContext(scope, tx =>
        tx.insert(tables.notifications).values([inbox('n1'), inbox('n1')])
      )
    ).rejects.toThrow('Duplicate fixture key');
    expect(state.rows.notifications).toEqual([]);
  });

  it('skips a repeated id within one statement under ON CONFLICT DO NOTHING', async () => {
    const inserted = await withTenantContext(scope, tx =>
      tx
        .insert(tables.notifications)
        .values([inbox('n1'), inbox('n1'), inbox('n2')])
        .onConflictDoNothing({ target: tables.notifications.id })
        .returning()
    );
    expect(inserted).toEqual([{ id: 'n1' }, { id: 'n2' }]);
    expect(state.rows.notifications.map(row => row.id)).toEqual(['n1', 'n2']);
  });

  it('skips a delivery replayed with a fresh id on the idempotency key it names', async () => {
    const target = [
      tables.notificationDeliveries.tenantId,
      tables.notificationDeliveries.idempotencyKey,
    ];
    const enqueue = (id: string) =>
      withTenantContext(scope, tx =>
        tx
          .insert(tables.notificationDeliveries)
          .values([delivery(id, 'key-1')])
          .onConflictDoNothing({ target })
          .returning()
      );
    expect(await enqueue('d1')).toEqual([{ id: 'd1' }]);
    expect(await enqueue('d2')).toEqual([]);
    expect(state.rows.notificationDeliveries.map(row => row.id)).toEqual(['d1']);
  });

  it('fails a conflict on a key other than the named target, as PostgreSQL does', async () => {
    await withTenantContext(scope, tx =>
      tx.insert(tables.notificationDeliveries).values([delivery('d1', 'key-1')])
    );
    await expect(
      withTenantContext(scope, tx =>
        tx
          .insert(tables.notificationDeliveries)
          .values([delivery('d2', 'key-1')])
          .onConflictDoNothing({ target: tables.notificationDeliveries.id })
      )
    ).rejects.toThrow('Duplicate fixture key');
    expect(state.rows.notificationDeliveries.map(row => row.id)).toEqual(['d1']);
  });

  it('refuses a target that names no unique key, and accepts one named in any column order', async () => {
    const deliveries = tables.notificationDeliveries;
    const insert = (id: string, target: (typeof deliveries)[string][]) =>
      withTenantContext(scope, tx =>
        tx
          .insert(deliveries)
          .values([delivery(id, 'key-1')])
          .onConflictDoNothing({ target })
          .returning()
      );
    await expect(insert('d1', [deliveries.idempotencyKey])).rejects.toThrow(
      'No unique key matches the ON CONFLICT target'
    );
    expect(state.rows.notificationDeliveries).toEqual([]);
    expect(await insert('d1', [deliveries.idempotencyKey, deliveries.tenantId])).toEqual([
      { id: 'd1' },
    ]);
    expect(await insert('d2', [deliveries.idempotencyKey, deliveries.tenantId])).toEqual([]);
  });

  it('refuses a second response request for the same source, as the expression index does', async () => {
    const request = (id: string, kind: string, sourceMessageId: string | null) => ({
      id,
      tenantId: ids.tenant,
      claimId: ids.claim,
      kind,
      sourceMessageId,
      requestedAt: new Date('2026-10-15T00:00:00Z'),
    });
    const insert = (row: ReturnType<typeof request>) =>
      withTenantContext(scope, tx => tx.insert(tables.claimResponseRequests).values(row));
    await insert(request('r1', 'member_message', 'm1'));
    await expect(insert(request('r2', 'member_message', 'm1'))).rejects.toThrow(
      'Duplicate fixture key'
    );
    await insert(request('r3', 'member_message', 'm2'));
    await insert(request('r4', 'claim_submitted', null));
    await expect(insert(request('r5', 'claim_submitted', null))).rejects.toThrow(
      'Duplicate fixture key'
    );
    expect(state.rows.claimResponseRequests.map(row => row.id)).toEqual(['r1', 'r3', 'r4']);
  });

  it('refuses a target on an expression-indexed column, writing nothing', async () => {
    const requests = tables.claimResponseRequests;
    await expect(
      withTenantContext(scope, tx =>
        tx
          .insert(requests)
          .values({
            id: 'r1',
            tenantId: ids.tenant,
            claimId: ids.claim,
            kind: 'member_message',
            sourceMessageId: 'm1',
          })
          .onConflictDoNothing({ target: requests.sourceMessageId })
      )
    ).rejects.toThrow('No unique key matches the ON CONFLICT target');
    expect(state.rows.claimResponseRequests).toEqual([]);
  });

  it('refuses a target column the fixture catalogue lacks instead of treating it as no target', async () => {
    // A property the catalogue does not have, exactly as a caller would reach it.
    const unknown = (tables.notifications as Record<string, (typeof tables.notifications)[string]>)
      .absentColumn;
    await expect(
      withTenantContext(scope, tx =>
        tx.insert(tables.notifications).values(inbox('n1')).onConflictDoNothing({ target: unknown })
      )
    ).rejects.toThrow('Unknown fixture column in the ON CONFLICT target');
    expect(state.rows.notifications).toEqual([]);
  });

  it.each([
    ['notificationDeliveries', ['tenantId', 'id'], delivery('x1', 'key-1')],
    ['claimMessages', ['tenantId', 'claimId', 'id'], message('x1')],
  ] as const)('accepts the composite unique key of %s as a target', async (name, fields, row) => {
    const table = tables[name];
    const insert = () =>
      withTenantContext(scope, tx =>
        tx
          .insert(table)
          .values(row)
          .onConflictDoNothing({ target: fields.map(field => table[field]) })
          .returning()
      );
    expect(await insert()).toEqual([{ id: 'x1' }]);
    expect(await insert()).toEqual([]);
    expect(state.rows[name].filter(row => row.id === 'x1')).toHaveLength(1);
  });
});
