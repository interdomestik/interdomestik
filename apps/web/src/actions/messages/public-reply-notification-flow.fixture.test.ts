import { beforeEach, describe, expect, it } from 'vitest';
import {
  ids,
  reset,
  state,
  tables,
  withTenantContext,
} from './public-reply-notification-flow.fixture';

const scope = { tenantId: ids.tenant };
const inbox = (id: string) => ({ id, tenantId: ids.tenant, userId: ids.staff });
const delivery = (id: string, idempotencyKey: string) => ({
  id,
  tenantId: ids.tenant,
  idempotencyKey,
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
});
