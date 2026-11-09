import assert from 'node:assert/strict';
import test from 'node:test';
import {
  insert,
  rejected,
  restricted,
  rollback,
  row,
  TABLES,
  update,
  withFixture,
} from './sponsor-test-fixture';

for (const table of TABLES) {
  test(`${table}: access-tenant visibility, denied writes and WITH CHECK`, async t => {
    await withFixture(t, async ({ admin, a, b }) => {
      const policies = await admin`select cmd, qual, with_check from pg_policies
        where schemaname = 'public' and tablename = ${table}`;
      assert.equal(policies.length, 1, 'No additional permissive policies');
      assert.equal(policies[0]?.cmd, 'ALL');
      assert.match(policies[0]?.qual ?? '', /app\.current_access_tenant_id/);
      assert.equal(policies[0]?.with_check, policies[0]?.qual);
      await restricted(admin, a, async tx => {
        const visible = await tx`select distinct tenant_id from ${tx(table)}`;
        assert.deepEqual(
          visible.map(r => r.tenant_id),
          [a.tenant]
        );
        const hidden =
          await tx`update ${tx(table)} set id = id where id = ${b[table]} returning id`;
        assert.equal(hidden.length, 0, 'Other-tenant UPDATE cannot reach a row');
        await rejected(
          tx,
          sp => insert(sp, table, row(b, table, true)),
          '42501',
          'row-level security'
        );
        await rollback(tx, sp => insert(sp, table, row(a, table, true)));
        // BEFORE UPDATE guards run before WITH CHECK on immutable tenant_id columns.
        // Do not mislabel their 23514 rejection as an RLS 42501 rejection.
        const guarded = table !== 'sponsors' && table !== 'sponsor_mail_outbox';
        await rejected(
          tx,
          sp => update(sp, table, a[table], { tenant_id: b.tenant }),
          guarded ? '23514' : '42501',
          guarded ? table : 'row-level security'
        );
        const [unchanged] = await tx`select tenant_id from ${tx(table)} where id = ${a[table]}`;
        assert.equal(unchanged?.tenant_id, a.tenant);
      });
      await restricted(admin, b, async tx => {
        const visible = await tx`select distinct tenant_id from ${tx(table)}`;
        assert.deepEqual(
          visible.map(r => r.tenant_id),
          [b.tenant]
        );
      });
      await restricted(admin, a, async tx => {
        await tx`select set_config('app.current_access_tenant_id', '', true)`;
        assert.equal((await tx`select id from ${tx(table)}`).length, 0);
        await rejected(
          tx,
          sp => insert(sp, table, row(a, table, true)),
          '42501',
          'row-level security'
        );
      });
    });
  });
}
