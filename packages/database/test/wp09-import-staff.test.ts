import assert from 'node:assert/strict';
import test from 'node:test';

import { rejected, rollback, uid } from './sponsor-test-fixture';
import { insertCompleteList, listRow, visibleIds } from './wp09-import-actions.fixture';
import {
  adminOf,
  asPrincipal,
  digest,
  insertRecord,
  staffOf,
  tables,
  withWp09Fixture,
} from './wp09-import.fixture';

test('WP-09 staff access follows an active named assignment before import rows and seats are visible', async t => {
  await withWp09Fixture(t, async ({ db, a, home, away }) => {
    const staff = staffOf(a);
    const readable = tables.slice(0, 5);
    for (const actor of [a.staff, a.user]) {
      await asPrincipal(db, { ...staff, actor }, async tx => {
        for (const table of readable) {
          const expected = actor === a.staff ? [{ id: home[table].id }] : [];
          assert.deepEqual([...(await visibleIds(tx, table))], expected, table);
        }
        for (const table of tables.slice(5)) {
          assert.equal((await visibleIds(tx, table)).length, 0, table);
        }
      });
    }
    // A tenant admin cannot submit a list, even under the staff member's actor id.
    await asPrincipal(db, { ...adminOf(a), actor: a.staff }, async tx => {
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_lists', {
            ...home.membership_import_lists,
            id: uid(),
            upload_key: uid(),
            digest: digest('admin list'),
            employer_approved_digest: digest('admin list'),
          }),
        '42501'
      );
    });
    // A decision delegation is not an import assignment.
    await asPrincipal(db, { ...staff, actor: a.decider }, async tx => {
      assert.equal((await visibleIds(tx, 'membership_import_lists')).length, 0);
    });
    await asPrincipal(db, staff, async tx => {
      const assignment = home.membership_import_assignments;
      const list = home.membership_import_lists;
      await rollback(tx, async sp => {
        const entryId = uid();
        const listId = uid();
        const newDigest = digest(listId);
        await insertRecord(sp, 'membership_import_lists', {
          ...list,
          id: listId,
          upload_key: listId,
          digest: newDigest,
          employer_approved_digest: newDigest,
        });
        await insertRecord(sp, 'membership_import_rows', {
          ...listRow(home, 1),
          id: entryId,
          list_id: listId,
        });
        await insertRecord(sp, 'sponsor_contract_year_seats', {
          ...home.sponsor_contract_year_seats,
          id: uid(),
          import_row_id: entryId,
          slot: 1,
        });
        assert.equal((await visibleIds(sp, 'sponsor_contract_year_seats')).length, 2);
      });
      const decision = await tx`update membership_import_lists set decision = 'approved'
        where id = ${list.id} returning id`;
      assert.equal(decision.length, 0);
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_assignments', {
            ...assignment,
            id: uid(),
            approved_by: a.user,
          }),
        '42501'
      );
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_lists', {
            ...list,
            id: uid(),
            sponsor_id: uid(),
          }),
        '42501'
      );
    });
    await asPrincipal(db, adminOf(a), async tx => {
      const id = home.membership_import_assignments.id;
      const foreign = await tx`update membership_import_assignments
        set revoked_at = now(), revoked_by = ${a.user}
        where id = ${away.membership_import_assignments.id} returning id`;
      assert.equal(foreign.length, 0);
      await rejected(
        tx,
        sp => sp`update membership_import_assignments
        set revoked_at = now(), revoked_by = ${a.staff} where id = ${id}`,
        '42501'
      );
      const revoked = await tx`update membership_import_assignments
        set revoked_at = now(), revoked_by = ${a.user} where id = ${id} returning id`;
      assert.deepEqual([...revoked], [{ id }]);
      const reset = await tx`update membership_import_assignments
        set revoked_at = null, revoked_by = null where id = ${id} returning id`;
      assert.equal(reset.length, 0);
    });
    await asPrincipal(db, staff, async tx => {
      for (const table of readable.slice(1)) {
        assert.equal((await visibleIds(tx, table)).length, 0, table);
      }
      // A revoked submitter can submit nothing further.
      await rejected(tx, sp => insertCompleteList(sp, home, 1), '42501');
    });
    // An admin without a decision delegation sees no list, row or seat.
    await asPrincipal(db, adminOf(a), async tx => {
      for (const table of readable.slice(2)) {
        assert.equal((await visibleIds(tx, table)).length, 0, table);
      }
    });
  });
});
