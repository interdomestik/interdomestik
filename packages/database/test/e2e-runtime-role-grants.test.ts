import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { provisionE2eRuntimeRole } from './e2e-runtime-role.fixture';
import { migrateJournal, scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';

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

test('late E2E role provisioning preserves the WP-12.1 column grants and trigger isolation', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  const role = `interdomestik_e2e_runtime_inbound_${suffix}`;
  const expectedInserts = {
    claim_inbound_pilot_cases: [],
    claim_inbound_object_verifications: [],
    claim_inbound_upload_decisions: [
      'tenant_id',
      'claim_id',
      'correlation_id',
      'classification',
      'decided_by',
      'role_basis',
      'recipient_id',
      'uploader_id',
      'office_receipt_ref',
      'document_id',
      'bucket',
      'file_path',
      'file_name',
      'mime_type',
      'file_size',
      'sha256',
    ],
    claim_correspondence_received_seals: [
      'tenant_id',
      'claim_id',
      'correspondence_id',
      'document_count',
    ],
    claim_correspondence_received_documents: [
      'tenant_id',
      'claim_id',
      'correspondence_id',
      'claim_document_id',
    ],
  };
  await withScratchDatabase('e2e_inbound_grants', async admin => {
    await migrateJournal(admin, fileURLToPath(new URL('../drizzle', import.meta.url)));
    const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
    const scratchUrl = new URL(process.env.DATABASE_URL!);
    scratchUrl.pathname = `/${name}`;
    try {
      await provisionE2eRuntimeRole({ adminUrl: scratchUrl.toString(), env: {}, role });
      for (const [table, expected] of Object.entries(expectedInserts)) {
        const qualified = `public.${table}`;
        const [posture] = await admin`select relrowsecurity as rls, relforcerowsecurity as forced,
          has_table_privilege(${role}, ${qualified}, 'SELECT') as readable,
          has_table_privilege(${role}, ${qualified}, 'INSERT,UPDATE,DELETE,TRUNCATE') as table_write
          from pg_class where oid = ${qualified}::regclass`;
        assert.deepEqual(
          { ...posture },
          { rls: true, forced: true, readable: true, table_write: false },
          table
        );
        const columns = await admin<{ name: string }[]>`select attname as name from pg_attribute
          where attrelid = ${qualified}::regclass and attnum > 0 and not attisdropped
            and has_column_privilege(${role}, ${qualified}, attname, 'INSERT')`;
        assert.deepEqual(columns.map(row => row.name).sort(), [...expected].sort(), table);
      }
      const [guard] = await admin`select rolcanlogin as login, rolbypassrls as bypass,
        has_function_privilege(${role}, 'public.claim_inbound_owner_guard_fn()', 'EXECUTE') as owner_lookup,
        has_function_privilege(${role}, 'public.claim_inbound_document_home_guard_fn()', 'EXECUTE') as home_lookup,
        has_function_privilege(${role}, 'public.record_claim_inbound_object_verification(uuid,text,text,integer,text)', 'EXECUTE') as attest
        from pg_roles where rolname = 'interdomestik_wp12_guard'`;
      assert.deepEqual(
        { ...guard },
        { login: false, bypass: false, owner_lookup: false, home_lookup: false, attest: false }
      );
      const [verifier] = await admin`select rolcanlogin as login, rolbypassrls as bypass,
        rolsuper as superuser, pg_has_role(${role}::name, oid, 'MEMBER') as runtime_member,
        pg_has_role(${role}::name, oid, 'USAGE') as runtime_inherits,
        pg_has_role(${role}::name, oid, case when current_setting('server_version_num')::integer >= 160000
          then 'SET' else 'MEMBER' end) as runtime_can_set,
        has_function_privilege(oid, 'public.record_claim_inbound_object_verification(uuid,text,text,integer,text)', 'EXECUTE') as attest,
        has_any_column_privilege(oid, 'public.claim_inbound_object_verifications', 'INSERT') as direct_insert
        from pg_roles where rolname = 'interdomestik_wp12_verifier'`;
      assert.deepEqual(
        { ...verifier },
        {
          login: false,
          bypass: false,
          superuser: false,
          runtime_member: false,
          runtime_inherits: false,
          runtime_can_set: false,
          attest: true,
          direct_insert: false,
        }
      );
      const apiVerifiers = await admin`select rolname from pg_roles
        where rolname in ('anon', 'authenticated', 'service_role')
          and has_function_privilege(oid, 'public.record_claim_inbound_object_verification(uuid,text,text,integer,text)', 'EXECUTE')`;
      assert.deepEqual(apiVerifiers, []);
    } finally {
      const [exists] = await admin`select 1 from pg_roles where rolname = ${role}`;
      if (exists) {
        await admin.unsafe(`drop owned by "${role}"`);
        await admin.unsafe(`drop role "${role}"`);
      }
    }
  });
});
