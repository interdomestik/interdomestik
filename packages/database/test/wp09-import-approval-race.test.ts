import assert from 'node:assert/strict';
import test from 'node:test';

import { rejected } from './sponsor-test-fixture';
import { decide, listRow } from './wp09-import-actions.fixture';
import {
  asPrincipal,
  deciderOf,
  insertRecord,
  staffOf,
  withWp09Fixture,
} from './wp09-import.fixture';

test('WP-09 a row insert racing approval cannot add to an approved list, in either order', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    const list = home.membership_import_lists;
    const listDigest = String(list.digest);
    await asPrincipal(db, staffOf(a), tx =>
      insertRecord(tx, 'membership_import_rows', listRow(home, 2))
    );
    let inserted = () => {};
    const rowPending = new Promise<void>(resolve => {
      inserted = resolve;
    });
    let finish = () => {};
    const decided = new Promise<void>(resolve => {
      finish = resolve;
    });
    // The third row is inserted in a transaction held open across the first decision.
    const writer = asPrincipal(db, staffOf(a), async tx => {
      await insertRecord(tx, 'membership_import_rows', listRow(home, 3));
      inserted();
      await decided;
    });
    await rowPending;
    try {
      // Decision first: the third row is not committed, so the list is incomplete.
      await asPrincipal(db, deciderOf(a), async tx => {
        await rejected(
          tx,
          sp => decide(sp, list.id, a.decider, listDigest),
          '23514',
          'membership_import_lists_complete'
        );
      });
    } finally {
      finish();
    }
    await writer;
    // Row first: the list is complete, approval succeeds, and no later row can follow.
    await asPrincipal(db, deciderOf(a), async tx => {
      assert.equal((await decide(tx, list.id, a.decider, listDigest)).length, 1);
    });
    await asPrincipal(db, staffOf(a), async tx => {
      await rejected(
        tx,
        sp => insertRecord(sp, 'membership_import_rows', listRow(home, 3)),
        '42501'
      );
    });
  });
});
