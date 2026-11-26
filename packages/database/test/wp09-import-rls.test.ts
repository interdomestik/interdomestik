import assert from 'node:assert/strict';
import test from 'node:test';

import { runtimeRole } from './exchange-rates-restricted.fixture';
import { END, rejected, rollback, uid, type Tx } from './sponsor-test-fixture';
import {
  adminOf,
  asPrincipal,
  digest,
  insertRecord,
  tables,
  withWp09Fixture,
  type Table,
} from './wp09-import.fixture';

function visibleIds(tx: Tx, table: Table) {
  return tx<{ id: string }[]>`select id from ${tx(table)} order by id`;
}

test('WP-09 forces RLS and scopes every new table to the admitted tenant and role', async t => {
  await withWp09Fixture(t, async ({ db, a, b, home, away, unprivilegedRole }) => {
    for (const table of tables) {
      await t.test(table, async () => {
        await asPrincipal(db, { ...adminOf(a), home: b.tenant }, async tx => {
          const [posture] = await tx`
            select current_user as role, r.rolsuper, r.rolbypassrls,
                   pg_has_role(current_user, c.relowner, 'MEMBER') as owner,
                   c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
                   row_security_active(c.oid::regclass) as active
            from pg_class c join pg_roles r on r.rolname = current_user
            where c.oid = ${'public.' + table}::regclass
          `;
          assert.deepEqual(posture, {
            role: runtimeRole,
            rolsuper: false,
            rolbypassrls: false,
            owner: false,
            enabled: true,
            forced: true,
            active: true,
          });
          assert.deepEqual([...(await visibleIds(tx, table))], [{ id: home[table].id }]);
          await rejected(tx, sp => insertRecord(sp, table, { ...away[table], id: uid() }), '42501');
          await rejected(tx, sp => sp`update ${sp(table)} set id = id`, '42501');
          await rejected(tx, sp => sp`delete from ${sp(table)}`, '42501');
          await rejected(tx, sp => sp`truncate table ${sp(table)}`, '42501');
        });
        await asPrincipal(db, { ...adminOf(b), home: a.tenant }, async tx => {
          assert.deepEqual([...(await visibleIds(tx, table))], [{ id: away[table].id }]);
        });
        for (const context of [
          { ...adminOf(a), role: 'member' },
          { ...adminOf(a), role: 'super_admin' },
          { ...adminOf(a), role: undefined },
          { ...adminOf(a), actor: undefined },
          { ...adminOf(a), tenant: undefined },
        ]) {
          await asPrincipal(db, context, async tx => {
            assert.equal((await visibleIds(tx, table)).length, 0);
            await rejected(
              tx,
              sp => insertRecord(sp, table, { ...home[table], id: uid() }),
              '42501'
            );
          });
        }
        await asPrincipal(db, { ...adminOf(a), dbRole: unprivilegedRole }, async tx => {
          await rejected(tx, sp => visibleIds(sp, table), '42501');
          await rejected(tx, sp => insertRecord(sp, table, home[table]), '42501');
        });
      });
    }
  });
});

test('WP-09 staff access follows an active named assignment before import rows and seats are visible', async t => {
  await withWp09Fixture(t, async ({ db, a, home, away }) => {
    const staff = { tenant: a.tenant, actor: a.staff, role: 'staff' };
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
          submitted_by: a.staff,
          verified_by: a.staff,
        });
        await insertRecord(sp, 'membership_import_rows', {
          ...home.membership_import_rows,
          id: entryId,
          list_id: listId,
          stable_identity_key: digest(entryId),
          email_alias_key: null,
          member_user_id: null,
          member_verified_at: null,
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
            approved_by: a.staff,
          }),
        '42501'
      );
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_lists', {
            ...list,
            id: uid(),
            submitted_by: a.staff,
            verified_by: a.staff,
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
    });
  });
});

test('WP-09 admin decisions bind the exact digest and become immutable', async t => {
  await withWp09Fixture(t, async ({ db, a, home, away }) => {
    const list = home.membership_import_lists;
    const decide = (tx: Tx, actor: string, digest = list.digest) => tx`
      update membership_import_lists
      set decision = 'approved', decided_by = ${actor}, decided_at = ${END}, decided_digest = ${digest}
      where id = ${list.id} returning decision
    `;
    await asPrincipal(db, adminOf(a), async tx => {
      const foreign = await tx`update membership_import_lists
        set decision = 'approved', decided_by = ${a.user}, decided_at = ${END}, decided_digest = digest
        where id = ${away.membership_import_lists.id} returning id`;
      assert.equal(foreign.length, 0);
      await rejected(tx, sp => decide(sp, a.staff), '42501');
      await rejected(
        tx,
        sp => decide(sp, a.user, 'f'.repeat(64)),
        '23514',
        'membership_import_lists_decision_ck'
      );
      await rollback(tx, async sp => {
        assert.deepEqual([...(await decide(sp, a.user))], [{ decision: 'approved' }]);
        assert.equal((await decide(sp, a.user)).length, 0);
        await rejected(
          sp,
          inner =>
            insertRecord(inner, 'membership_import_rows', {
              ...home.membership_import_rows,
              id: uid(),
              source_row: 2,
            }),
          '42501'
        );
      });
    });
  });
});
