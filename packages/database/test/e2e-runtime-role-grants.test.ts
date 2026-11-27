import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

import { provisionE2eRuntimeRole } from './e2e-runtime-role.fixture';
import { restricted } from './exchange-rates-restricted.fixture';
import { migrateJournalThrough } from './journal-prefix.support';
import {
  scratchServerMissing,
  type ScratchClient,
  withScratchDatabase,
} from './pg16/scratch-database';
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
          const narrowedTables = narrowed.map(table => `public.${table}`).join(', ');
          await admin.unsafe(`grant insert, update, delete, truncate on table
            ${narrowedTables} to ${quotedRole}`);
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
            [...(editable ?? [])].sort((a, b) => Number(a > b) - Number(a < b)),
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

async function assertInboundFunctionGrants(admin: ScratchClient, role: string) {
  const guard = 'interdomestik_wp12_guard';
  const receiptWriter = 'interdomestik_wp12_receipt_writer';
  const verifier = 'interdomestik_wp12_verifier';
  const appRole = 'interdomestik_runtime_rls';
  const [app] = await admin`select 1 from pg_roles where rolname = ${appRole}`;
  const runtimeRoles = app ? [role, appRole] : [role];
  const expectedGrants: Record<string, readonly string[]> = {
    'claim_inbound_reserved_path(text)': [...runtimeRoles, guard],
    'claim_inbound_staff_branch_allowed(text,text)': runtimeRoles,
    'claim_inbound_lock_staff_branch(text,text)': [receiptWriter],
    'claim_inbound_decision_visible(text,text,text,text,text,text,varchar,varchar)': [
      ...runtimeRoles,
      guard,
      receiptWriter,
    ],
    'claim_inbound_decision_deadline(timestamptz)': [...runtimeRoles, receiptWriter],
    'record_claim_inbound_object_verification(uuid,text,text,integer,text)': [verifier],
    'claim_inbound_enrollment_guard_fn()': [],
    'claim_inbound_document_home_guard_fn()': [],
    'claim_inbound_decision_guard_fn()': [],
    'claim_inbound_document_publication_guard_fn()': [],
    'claim_inbound_staff_scope_guard_fn()': [],
    'claim_inbound_document_scope_guard_fn()': [],
    'claim_inbound_polymorphic_guard_fn()': [],
    'claim_inbound_owner_guard_fn()': [],
    'claim_received_seal_guard_fn()': [],
    'claim_received_document_guard_fn()': [],
    'claim_received_set_count_fn()': [],
  };
  for (const [signature, grantees] of Object.entries(expectedGrants)) {
    const [posture] = await admin<{ runtime_execute: boolean; grantees: string[] }[]>`select
      has_function_privilege(${role}, p.oid, 'EXECUTE') as runtime_execute,
      array(select coalesce(r.rolname::text, 'PUBLIC') || case when acl.is_grantable then '*' else '' end
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
        left join pg_roles as r on r.oid = acl.grantee
        where acl.grantee <> p.proowner and acl.privilege_type = 'EXECUTE') as grantees
      from pg_proc as p where p.oid = ${`public.${signature}`}::regprocedure`;
    assert.deepEqual(posture.grantees.sort(), [...grantees].sort(), signature);
    assert.equal(posture.runtime_execute, grantees.includes(role), signature);
  }
}

test('late E2E role provisioning preserves the WP-12.1 function and column grants', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  const role = `interdomestik_e2e_runtime_inbound${suffix}`;
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
    const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));
    await migrateJournalThrough(admin, migrations, '0113_wp07_rate_check_contract');
    // Exercise installation-specific direct grants alongside PostgreSQL's PUBLIC default.
    await admin`alter default privileges in schema public grant execute on functions to pg_read_all_data`;
    await migrateJournalThrough(admin, migrations, '0114_wp12_1_inbound_documents');
    const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
    const scratchUrl = new URL(process.env.DATABASE_URL!);
    scratchUrl.pathname = `/${name}`;
    try {
      await provisionE2eRuntimeRole({ adminUrl: scratchUrl.toString(), env: {}, role });
      await assertInboundFunctionGrants(admin, role);
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
      assert.deepEqual([...apiVerifiers], []);
    } finally {
      const [exists] = await admin`select 1 from pg_roles where rolname = ${role}`;
      if (exists) {
        await admin.unsafe(`drop owned by "${role}"`);
        await admin.unsafe(`drop role "${role}"`);
      }
    }
  });
});
