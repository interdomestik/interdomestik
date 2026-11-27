import assert from 'node:assert/strict';
import test from 'node:test';
import type postgres from 'postgres';

import { runtimeRole } from './exchange-rates-restricted.fixture';
import {
  END,
  START,
  insert,
  rejected,
  rollback,
  uid,
  type Scope,
  type Tx,
} from './sponsor-test-fixture';
import {
  adminOf,
  asPrincipal,
  deciderOf,
  delegation,
  digest,
  insertRecord,
  staffOf,
  tables,
  withWp09Fixture,
  writerOf,
  type Records,
  type Table,
} from './wp09-import.fixture';

function visibleIds(tx: Tx, table: Table) {
  return tx<{ id: string }[]>`select id from ${tx(table)} order by id`;
}

function decide(tx: Tx, listId: string, actor: string, listDigest: string, decision = 'approved') {
  return tx`
    update membership_import_lists
    set decision = ${decision}, decided_by = ${actor}, decided_at = ${END},
        decided_digest = ${listDigest}
    where id = ${listId} returning decision
  `;
}

/** A further row of the fixture list, at the given position, with its own identity. */
function listRow(home: Records, sourceRow: number) {
  const id = uid();
  return {
    ...home.membership_import_rows,
    id,
    source_row: sourceRow,
    stable_identity_key: digest(id),
    email_alias_key: null,
    member_user_id: null,
    member_verified_at: null,
  };
}

/** Fills positions 2 and 3, so the fixture list holds all of its three rows. */
function completeList(db: postgres.Sql, a: Scope, home: Records) {
  return asPrincipal(db, staffOf(a), async tx => {
    await insertRecord(tx, 'membership_import_rows', listRow(home, 2));
    await insertRecord(tx, 'membership_import_rows', listRow(home, 3));
  });
}

async function insertUser(db: postgres.Sql, tenantId: string): Promise<string> {
  const id = uid();
  await insert(db, 'user', {
    id,
    tenant_id: tenantId,
    name: 'Test',
    email: `${id}@example.test`,
    emailVerified: false,
    createdAt: START,
    updatedAt: START,
  });
  return id;
}

test('WP-09 is dormant: the migration grants the runtime role nothing on the eight tables', async t => {
  await withWp09Fixture(t, async ({ migratedPrivileges }) => {
    assert.deepEqual(migratedPrivileges, []);
  });
});

test('WP-09 forces RLS and scopes every new table to the admitted tenant and role', async t => {
  await withWp09Fixture(t, async ({ db, a, b, home, away, unprivilegedRole }) => {
    for (const table of tables) {
      await t.test(table, async () => {
        const writer = writerOf(a, table);
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
          const ids = (await visibleIds(tx, table)).map(row => row.id);
          assert.ok(ids.includes(home[table].id));
          assert.ok(!ids.includes(away[table].id));
          await rejected(tx, sp => sp`update ${sp(table)} set id = id`, '42501');
          await rejected(tx, sp => sp`delete from ${sp(table)}`, '42501');
          await rejected(tx, sp => sp`truncate table ${sp(table)}`, '42501');
        });
        // Tenant denial with the writer's own actor and row: only the tenant column differs.
        await asPrincipal(db, writer, async tx => {
          await rejected(
            tx,
            sp => insertRecord(sp, table, { ...home[table], id: uid(), tenant_id: b.tenant }),
            '42501'
          );
        });
        await asPrincipal(db, { ...adminOf(b), home: a.tenant }, async tx => {
          const ids = (await visibleIds(tx, table)).map(row => row.id);
          assert.ok(ids.includes(away[table].id));
          assert.ok(!ids.includes(home[table].id));
        });
        for (const context of [
          { ...writer, role: 'member' },
          { ...writer, role: 'super_admin' },
          { ...writer, role: undefined },
          { ...writer, actor: undefined },
          { ...writer, actor: ' ' },
          { ...writer, actor: '\t' },
          { ...writer, actor: '\n' },
          { ...writer, tenant: undefined },
          { ...writer, tenant: ' ' },
          { ...writer, tenant: '\t\n' },
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
        await asPrincipal(db, { ...writer, dbRole: unprivilegedRole }, async tx => {
          await rejected(tx, sp => visibleIds(sp, table), '42501');
          await rejected(tx, sp => insertRecord(sp, table, home[table]), '42501');
        });
      });
    }
  });
});

test('WP-09 actor columns bind the session actor, not another same-tenant user', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    await asPrincipal(db, staffOf(a), async tx => {
      const listId = uid();
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_lists', {
            ...home.membership_import_lists,
            id: listId,
            upload_key: listId,
            digest: digest(listId),
            employer_approved_digest: digest(listId),
            submitted_by: a.decider,
            verified_by: a.decider,
          }),
        '42501'
      );
    });
    await asPrincipal(db, adminOf(a), async tx => {
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_opt_out_tokens', {
            ...home.membership_opt_out_tokens,
            id: uid(),
            issued_by: a.staff,
            token_hash: digest('other issuer'),
          }),
        '42501'
      );
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'sponsor_exit_events', {
            ...home.sponsor_exit_events,
            id: uid(),
            operation_id: uid(),
            recorded_by: a.staff,
          }),
        '42501'
      );
    });
  });
});

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
    });
  });
});

test('WP-09 list decisions need a delegated decider for the entity, never the submitter', async t => {
  await withWp09Fixture(t, async ({ db, a, home, away }) => {
    const list = home.membership_import_lists;
    const listDigest = String(list.digest);
    await completeList(db, a, home);
    await asPrincipal(db, adminOf(a), async tx => {
      const foreign = await decide(
        tx,
        away.membership_import_lists.id,
        a.user,
        String(away.membership_import_lists.digest)
      );
      assert.equal(foreign.length, 0);
      // The admin who approved the delegation holds none.
      await rejected(tx, sp => decide(sp, list.id, a.user, listDigest), '42501');
      // The delegated decider's name in decided_by, from another session actor.
      await rejected(tx, sp => decide(sp, list.id, a.decider, listDigest), '42501');
      // Nobody delegates to themselves.
      await rejected(
        tx,
        sp =>
          insertRecord(sp, 'membership_import_assignments', {
            ...delegation(a),
            staff_user_id: a.user,
          }),
        '23514',
        'membership_import_assignments_separation_ck'
      );
      // The submitter receives a delegation for this exact list target.
      await insertRecord(tx, 'membership_import_assignments', {
        ...delegation(a),
        staff_user_id: a.staff,
      });
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
    const sideAdmin = await insertUser(db, a.tenant);
    await asPrincipal(db, adminOf(a), tx =>
      insertRecord(tx, 'membership_import_assignments', {
        ...delegation(a, otherEntity),
        staff_user_id: sideAdmin,
      })
    );
    await asPrincipal(db, { ...adminOf(a), actor: sideAdmin }, async tx => {
      await rejected(tx, sp => decide(sp, list.id, sideAdmin, listDigest), '42501');
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

test('WP-09 approval binds the exact digest and a complete list, then becomes immutable', async t => {
  await withWp09Fixture(t, async ({ db, a, home }) => {
    const list = home.membership_import_lists;
    const listDigest = String(list.digest);
    await asPrincipal(db, deciderOf(a), async tx => {
      // One of three rows present: approval refused, rejection allowed.
      await rejected(
        tx,
        sp => decide(sp, list.id, a.decider, listDigest),
        '23514',
        'membership_import_lists_complete'
      );
      await rollback(tx, async sp => {
        assert.deepEqual(
          [...(await decide(sp, list.id, a.decider, listDigest, 'rejected'))],
          [{ decision: 'rejected' }]
        );
      });
    });
    await completeList(db, a, home);
    await asPrincipal(db, staffOf(a), async tx => {
      // Positions are bounded by the row count.
      await rejected(
        tx,
        sp => insertRecord(sp, 'membership_import_rows', listRow(home, 4)),
        '42501'
      );
    });
    await asPrincipal(db, deciderOf(a), async tx => {
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
      assert.equal((await decide(tx, list.id, a.decider, listDigest)).length, 0);
    });
    await asPrincipal(db, staffOf(a), async tx => {
      await rejected(
        tx,
        sp => insertRecord(sp, 'membership_import_rows', listRow(home, 3)),
        '42501'
      );
    });
    // Even the table owner cannot change a non-decision column of a list.
    await db.begin(async tx => {
      await rejected(
        tx,
        sp => sp`update membership_import_lists set row_count = 1 where id = ${list.id}`,
        '23514',
        'membership_import_lists_decision_scope'
      );
    });
  });
});

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
