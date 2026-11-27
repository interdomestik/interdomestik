import assert from 'node:assert/strict';
import test from 'node:test';

import { runtimeRole } from './exchange-rates-restricted.fixture';
import { rejected, uid } from './sponsor-test-fixture';
import { visibleIds } from './wp09-import-actions.fixture';
import {
  adminOf,
  asPrincipal,
  digest,
  insertRecord,
  staffOf,
  tables,
  withWp09Fixture,
  writerOf,
} from './wp09-import.fixture';

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
