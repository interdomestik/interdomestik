import assert from 'node:assert/strict';
import test from 'node:test';

import { END, START, insert, rejected, rollback, uid } from './sponsor-test-fixture';
import { decide, insertUser, listRow } from './wp09-import-actions.fixture';
import {
  adminOf,
  asPrincipal,
  deciderOf,
  delegation,
  insertRecord,
  staffOf,
  withWp09Fixture,
} from './wp09-import.fixture';

test('WP-09 list decisions need a delegated decider for the entity, never the submitter', async t => {
  await withWp09Fixture(t, async ({ db, a, home, away }) => {
    const list = home.membership_import_lists;
    const listDigest = String(list.digest);
    const third = await insertUser(db, a.tenant);
    await asPrincipal(db, adminOf(a), async tx => {
      const foreign = await decide(
        tx,
        away.membership_import_lists.id,
        a.user,
        String(away.membership_import_lists.digest)
      );
      assert.equal(foreign.length, 0);
      // An admin without a delegation does not even see the list.
      assert.equal((await decide(tx, list.id, a.user, listDigest)).length, 0);
    });
    // Delegations are issued by the owner in this dormant PR. Nobody delegates to themselves.
    await db.begin(tx =>
      rejected(
        tx,
        sp =>
          insert(sp, 'membership_import_assignments', { ...delegation(a), staff_user_id: a.user }),
        '23514',
        'membership_import_assignments_separation_ck'
      )
    );
    // The submitter receives a delegation for this exact list target.
    await insert(db, 'membership_import_assignments', { ...delegation(a), staff_user_id: a.staff });
    // The delegated decider, on a complete list, naming a third user in decided_by: refused.
    await asPrincipal(db, deciderOf(a), async tx => {
      await rejected(tx, sp => decide(sp, list.id, third, listDigest), '42501');
    });
    // Self-approval by the submitter, now acting as a delegated admin: refused.
    await asPrincipal(db, { ...adminOf(a), actor: a.staff }, async tx => {
      await rejected(tx, sp => decide(sp, list.id, a.staff, listDigest), '42501');
    });
    // A delegation for another entity of the same tenant does not reach this list.
    const otherEntity = uid();
    await insert(db, 'legal_entities', {
      id: otherEntity,
      tenant_id: a.tenant,
      legal_name: 'Other',
      country_code: 'XK',
      updated_at: START,
    });
    await insert(db, 'membership_import_assignments', {
      ...delegation(a, otherEntity),
      staff_user_id: third,
    });
    await asPrincipal(db, { ...adminOf(a), actor: third }, async tx => {
      assert.equal((await decide(tx, list.id, third, listDigest)).length, 0);
    });
    // The database refuses self-approval whoever writes, including the table owner.
    await db.begin(async tx => {
      await rejected(
        tx,
        sp => sp`update membership_import_lists set decision = 'approved',
          decided_by = submitted_by, decided_at = ${END}, decided_digest = digest
          where id = ${list.id}`,
        '23514',
        'membership_import_lists_decision_ck'
      );
    });
    // The delegated decider approves.
    await asPrincipal(db, deciderOf(a), async tx => {
      assert.deepEqual(
        [...(await decide(tx, list.id, a.decider, listDigest))],
        [{ decision: 'approved' }]
      );
    });
  });
});

test('WP-09 a decision binds the exact digest, is set once and admits no later row', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    const list = home.membership_import_lists;
    const listDigest = String(list.digest);
    await asPrincipal(db, deciderOf(a), async tx => {
      await rollback(tx, async sp => {
        assert.deepEqual(
          [...(await decide(sp, list.id, a.decider, listDigest, 'rejected'))],
          [{ decision: 'rejected' }]
        );
      });
      await rejected(
        tx,
        sp => decide(sp, list.id, a.decider, 'f'.repeat(64)),
        '23514',
        'membership_import_lists_decision_ck'
      );
      assert.deepEqual(
        [...(await decide(tx, list.id, a.decider, listDigest))],
        [{ decision: 'approved' }]
      );
      assert.equal((await decide(tx, list.id, a.decider, listDigest, 'rejected')).length, 0);
    });
    await asPrincipal(db, staffOf(a), async tx => {
      for (const sourceRow of [1, 2]) {
        await rejected(
          tx,
          sp => insertRecord(sp, 'membership_import_rows', listRow(home, sourceRow)),
          '42501'
        );
      }
    });
    // Even the table owner cannot change a non-decision column of a list.
    await db.begin(async tx => {
      await rejected(
        tx,
        sp => sp`update membership_import_lists set row_count = 2 where id = ${list.id}`,
        '23514',
        'membership_import_lists_update_scope'
      );
    });
  });
});
