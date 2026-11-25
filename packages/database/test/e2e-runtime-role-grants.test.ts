import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import type postgres from 'postgres';

import { provisionE2eRuntimeRole } from './e2e-runtime-role.fixture';
import { restricted } from './exchange-rates-restricted.fixture';
import { scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';
import { quoteIdentifier } from './rls-test-connection';

const suffix = randomBytes(6).toString('hex');

test('E2E provisioning and reprovisioning preserve the rate-book and case register grants', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  const role = `interdomestik_e2e_runtime_g${suffix}`;
  const quotedRole = quoteIdentifier(role);
  const readOnly = ['exchange_rate_verification_limits', 'exchange_rate_check_windows'];
  const appendOnly = ['exchange_rate_verifications', 'exchange_rate_check_events'];
  const ordinary = 'unrestricted_fixture_table';
  const updatableColumns: Record<string, readonly string[]> = {
    claim_authorities: ['revoked_at', 'revoked_by_user_id'],
    claim_correspondence: ['follow_up_at'],
    claim_correspondence_documents: [],
    claim_case_fields: [
      'insurance_proof_reference',
      'other_vehicle_country_code',
      'outside_handling_party',
      'coverage_verification_status',
      'case_follow_up_at',
      'updated_by_staff_id',
      'updated_at',
    ],
  };
  const narrowed = [...readOnly, ...appendOnly, ...Object.keys(updatableColumns)];
  const tables = [...narrowed, ordinary];
  await withScratchDatabase('e2e_role_grants', async admin => {
    const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
    const scratchUrl = new URL(process.env.DATABASE_URL!);
    scratchUrl.pathname = `/${name}`;
    try {
      for (const table of tables) {
        const columns = ['tenant_id', 'claim_id', ...(updatableColumns[table] ?? [])];
        await admin.unsafe(`
          create table public.${table}(${columns.map(column => `${column} text`).join(', ')});
          alter table public.${table} enable row level security;
          alter table public.${table} force row level security;
          create policy p on public.${table}
            using (tenant_id = current_setting('app.current_access_tenant_id', true));`);
      }
      for (const phase of ['provision', 'reprovision']) {
        if (phase === 'reprovision') {
          await admin.unsafe(`grant insert, update, delete, truncate on table
            ${narrowed.map(table => `public.${table}`).join(', ')} to ${quotedRole}`);
        }
        await provisionE2eRuntimeRole({ adminUrl: scratchUrl.toString(), env: {}, role });
        for (const table of tables) {
          const qualifiedTable = `public.${table}`;
          const label = `${phase}: ${table}`;
          const [privileges] = await admin`
            select
              has_table_privilege(${role}, ${qualifiedTable}, 'SELECT') as "select",
              has_table_privilege(${role}, ${qualifiedTable}, 'INSERT') as "insert",
              has_table_privilege(${role}, ${qualifiedTable}, 'UPDATE') as "update",
              has_table_privilege(${role}, ${qualifiedTable}, 'DELETE') as "delete",
              has_table_privilege(${role}, ${qualifiedTable}, 'TRUNCATE') as "truncate"`;
          assert.deepEqual(
            { ...privileges },
            {
              select: true,
              insert: !readOnly.includes(table),
              update: table === ordinary,
              delete: table === ordinary,
              truncate: false,
            },
            label
          );
          const columns = await admin<{ column_name: string }[]>`
            select attname as column_name
            from pg_attribute
            where attrelid = ${qualifiedTable}::regclass and attnum > 0 and not attisdropped
              and has_column_privilege(${role}, ${qualifiedTable}, attname, 'UPDATE')
            order by attname`;
          const editable = table === ordinary ? ['claim_id', 'tenant_id'] : updatableColumns[table];
          assert.deepEqual(
            columns.map(row => row.column_name),
            [...(editable ?? [])].sort(),
            label
          );
        }
      }
      const tenantId = 'e2e-grants-tenant';
      const asTenant = <T>(run: (tx: postgres.TransactionSql) => Promise<T>) =>
        restricted(admin, tenantId, run, role);
      await asTenant(async tx => {
        await tx`insert into exchange_rate_check_events values (${tenantId}, 'event')`;
        await tx`insert into claim_correspondence (tenant_id, claim_id) values (${tenantId}, 'claim')`;
        const updated = await tx`update claim_correspondence set follow_up_at = 'later'
          where claim_id = 'claim' returning follow_up_at`;
        assert.deepEqual([...updated], [{ follow_up_at: 'later' }]);
        await tx`insert into unrestricted_fixture_table values (${tenantId}, 'control')`;
        const deleted = await tx`delete from unrestricted_fixture_table returning claim_id`;
        assert.deepEqual([...deleted], [{ claim_id: 'control' }]);
      });
      await assert.rejects(
        asTenant(tx => tx`insert into exchange_rate_check_windows values (${tenantId}, 'window')`),
        { code: '42501', message: 'permission denied for table exchange_rate_check_windows' }
      );
      await assert.rejects(
        asTenant(tx => tx`update claim_correspondence set claim_id = 'rewritten'`),
        { code: '42501', message: 'permission denied for table claim_correspondence' }
      );
      await assert.rejects(
        asTenant(tx => tx`delete from claim_correspondence`),
        {
          code: '42501',
          message: 'permission denied for table claim_correspondence',
        }
      );
    } finally {
      const [exists] = await admin`select 1 from pg_roles where rolname = ${role}`;
      if (exists) {
        await admin.unsafe(`drop owned by ${quotedRole}`);
        await admin.unsafe(`drop role ${quotedRole}`);
      }
    }
  });
});
