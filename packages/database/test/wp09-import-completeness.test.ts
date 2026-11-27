import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';

import { rejected, uid } from './sponsor-test-fixture';
import { decide, freshList, insertCompleteList, listRow } from './wp09-import-actions.fixture';
import {
  asPrincipal,
  deciderOf,
  insertRecord,
  staffOf,
  withWp09Fixture,
} from './wp09-import.fixture';

test('WP-09 a list cannot commit without all of its rows', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    const list = freshList(home, 2);
    await assert.rejects(
      asPrincipal(db, staffOf(a), async tx => {
        await insertRecord(tx, 'membership_import_lists', list);
        await insertRecord(tx, 'membership_import_rows', listRow(home, 1, list.id));
      }),
      (error: unknown) => {
        assert.ok(error instanceof postgres.PostgresError);
        assert.equal(error.code, '23514');
        assert.equal(error.constraint_name, 'membership_import_lists_complete');
        return true;
      }
    );
    await asPrincipal(db, staffOf(a), async tx => {
      const rows = await tx`select id from membership_import_lists where id = ${list.id}`;
      assert.equal(rows.length, 0);
    });
  });
});

test('WP-09 a company list cannot commit without one seat per row', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    const list = freshList(home, 1);
    await assert.rejects(
      asPrincipal(db, staffOf(a), async tx => {
        await insertRecord(tx, 'membership_import_lists', list);
        await insertRecord(tx, 'membership_import_rows', listRow(home, 1, list.id));
      }),
      (error: unknown) => {
        assert.ok(error instanceof postgres.PostgresError);
        assert.equal(error.code, '23514');
        assert.equal(error.constraint_name, 'membership_import_lists_seated');
        return true;
      }
    );
  });
});

test('WP-09 a committed list admits no row before or after its decision, approved or rejected', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    const created = await asPrincipal(db, staffOf(a), tx => insertCompleteList(tx, home, [3, 4]));
    const { list } = created;
    const count = () =>
      asPrincipal(db, staffOf(a), async tx => {
        const [row] = await tx<{ n: number }[]>`select count(*)::int as n
          from membership_import_rows where list_id = ${list.id}`;
        return row.n;
      });
    // Taken positions conflict while pending; a decided list refuses any row by policy.
    const refuseEveryPosition = (pending: boolean) =>
      asPrincipal(db, staffOf(a), async tx => {
        for (const sourceRow of [1, 2, 3]) {
          await rejected(
            tx,
            sp => insertRecord(sp, 'membership_import_rows', listRow(home, sourceRow, list.id)),
            pending && sourceRow <= 2 ? '23505' : '42501'
          );
        }
      });
    // Pending: every position is taken and none beyond the row count exists.
    await refuseEveryPosition(true);
    // A row insert held open on another list does not reach this one, and the decision
    // commits with exactly the committed rows.
    let opened = () => {};
    const holding = new Promise<void>(resolve => {
      opened = resolve;
    });
    let release = () => {};
    const released = new Promise<void>(resolve => {
      release = resolve;
    });
    const writer = asPrincipal(db, staffOf(a), async tx => {
      await insertCompleteList(tx, home, [5]);
      opened();
      await released;
    });
    await holding;
    try {
      await asPrincipal(db, deciderOf(a), async tx => {
        assert.deepEqual(
          [...(await decide(tx, list.id, a.decider, String(list.digest), 'rejected'))],
          [{ decision: 'rejected' }]
        );
      });
    } finally {
      release();
    }
    await writer;
    assert.equal(await count(), 2);
    await refuseEveryPosition(false);
    // No seat can follow the decision either: the policy refuses a decided list.
    await asPrincipal(db, staffOf(a), async tx => {
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'sponsor_contract_year_seats', {
            ...home.sponsor_contract_year_seats,
            id: uid(),
            import_row_id: created.rows[0].id,
            slot: 6,
          }),
        '42501'
      );
      const [seats] = await tx<{ n: number }[]>`select count(*)::int as n
        from sponsor_contract_year_seats where import_row_id in ${tx(created.rows.map(r => r.id))}`;
      assert.equal(seats.n, 2);
    });
    assert.equal(await count(), 2);
  });
});

test("WP-09 a fulfilled row's period reference is opaque", async t => {
  await withWp09Fixture(t, async ({ db, home }) => {
    // Only a fulfilled row carries a period reference, so the owner writes this case.
    await db.begin(tx =>
      rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_rows', {
            ...home.membership_import_rows,
            id: uid(),
            fulfillment_state: 'fulfilled',
            period_origin_ref: 'period of Jane Doe',
          }),
        '23514',
        'membership_import_rows_fulfillment_ck'
      )
    );
  });
});
