import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { provisionE2eRuntimeRole } from './e2e-runtime-role.fixture';
import { scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';

const suffix = randomBytes(6).toString('hex');

// WP-12: the bulk DML grant must preserve the migration's column-level restrictions.
test('the E2E runtime role keeps the narrowed grants of the case register tables', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  const role = `interdomestik_e2e_runtime_g${suffix}`;
  const updatableColumns = {
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
  await withScratchDatabase('e2e_role_grants', async admin => {
    const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
    const scratchUrl = new URL(process.env.DATABASE_URL!);
    scratchUrl.pathname = `/${name}`;
    try {
      for (const [table, editable] of Object.entries(updatableColumns)) {
        const columns = ['tenant_id', 'claim_id', ...editable];
        await admin.unsafe(`
          create table public.${table}(${columns.map(column => `${column} text`).join(', ')});
          alter table public.${table} enable row level security;
          alter table public.${table} force row level security;
          create policy p on public.${table}
            using (tenant_id = current_setting('app.current_access_tenant_id', true));`);
      }
      await provisionE2eRuntimeRole({ adminUrl: scratchUrl.toString(), env: {}, role });
      for (const [table, editable] of Object.entries(updatableColumns)) {
        const qualifiedTable = `public.${table}`;
        const [privileges] = await admin`
          select
            has_table_privilege(${role}, ${qualifiedTable}, 'SELECT') as "select",
            has_table_privilege(${role}, ${qualifiedTable}, 'INSERT') as "insert",
            has_table_privilege(${role}, ${qualifiedTable}, 'UPDATE') as "update",
            has_table_privilege(${role}, ${qualifiedTable}, 'DELETE') as "delete",
            has_table_privilege(${role}, ${qualifiedTable}, 'TRUNCATE') as "truncate"`;
        assert.deepEqual(
          { ...privileges },
          { select: true, insert: true, update: false, delete: false, truncate: false },
          table
        );
        const columns = await admin<{ column_name: string }[]>`
          select attname as column_name
          from pg_attribute
          where attrelid = ${qualifiedTable}::regclass and attnum > 0 and not attisdropped
            and has_column_privilege(${role}, ${qualifiedTable}, attname, 'UPDATE')
          order by attname`;
        assert.deepEqual(
          columns.map(row => row.column_name),
          // PostgreSQL orders `name` by bytes; compare the same way.
          [...editable].sort((left, right) => Number(left > right) - Number(left < right)),
          table
        );
      }
    } finally {
      const [exists] = await admin`select 1 from pg_roles where rolname = ${role}`;
      if (exists) {
        await admin.unsafe(`drop owned by "${role}"`);
        await admin.unsafe(`drop role "${role}"`);
      }
    }
  });
});
