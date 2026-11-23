import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';

import {
  foreignTenant,
  homeTenant,
  insertClaim,
  restricted,
  withRegisterDb,
  type Case,
  type Connection,
} from './claim-correspondence.fixture';
import { migrateJournal, scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';
import { quoteIdentifier } from './rls-test-connection';

const rlsDenied = { code: '42501', message: /row-level security/u };
const runtimeRole = 'interdomestik_runtime_rls';

function caseFields(claim: Case, reference = 'proof-01') {
  return {
    tenant_id: claim.tenant,
    claim_id: claim.id,
    other_vehicle_country_code: 'DE',
    insurance_proof_reference: reference,
    coverage_verification_status: 'requested',
    updated_by_staff_id: claim.user,
  };
}

function insertCaseFields(
  sql: postgres.Sql | postgres.TransactionSql,
  row: ReturnType<typeof caseFields>
) {
  return sql`insert into claim_case_fields ${sql(row)}`;
}

const visibleReferences = (runtime: postgres.Sql, claimId: string, scope = {}) =>
  restricted(
    runtime,
    tx => tx<{ insurance_proof_reference: string }[]>`
      select insurance_proof_reference from claim_case_fields where claim_id = ${claimId}`,
    scope
  );

test('WP-12 case fields: tenant policy, delegation and cascade under the runtime role', async t => {
  await withRegisterDb(t, connections => proveCaseFields(t, connections));
});

async function proveCaseFields(t: TestContext, { admin, runtime }: Connection) {
  await t.test('RLS is forced and scopes every read and write to the home tenant', async () => {
    const [rls] = await admin`select relrowsecurity, relforcerowsecurity
      from pg_class where oid = 'public.claim_case_fields'::regclass`;
    assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });

    const own = await insertClaim(admin);
    const foreign = await insertClaim(admin, { tenant: foreignTenant });
    await restricted(runtime, tx => insertCaseFields(tx, caseFields(own)));
    assert.deepEqual(
      [...(await visibleReferences(runtime, own.id))],
      [{ insurance_proof_reference: 'proof-01' }]
    );
    for (const scope of [
      { home: foreignTenant },
      { home: foreignTenant, access: homeTenant },
      { access: foreignTenant },
    ]) {
      assert.equal(
        (await visibleReferences(runtime, own.id, scope)).length,
        0,
        JSON.stringify(scope)
      );
    }
    // Writes: another tenant's claim, a claim id of another tenant under this tenant, a split scope.
    await assert.rejects(
      restricted(runtime, tx => insertCaseFields(tx, caseFields(foreign))),
      rlsDenied
    );
    await assert.rejects(
      restricted(runtime, tx =>
        insertCaseFields(tx, { ...caseFields(foreign), tenant_id: homeTenant })
      ),
      rlsDenied
    );
    const fresh = await insertClaim(admin);
    await assert.rejects(
      restricted(runtime, tx => insertCaseFields(tx, caseFields(fresh)), {
        home: foreignTenant,
        access: homeTenant,
      }),
      rlsDenied
    );
  });

  await t.test('a side row is never visible without its claim after delegation', async () => {
    const claim = await insertClaim(admin);
    await restricted(runtime, tx => insertCaseFields(tx, caseFields(claim, 'proof-delegated')));
    // Positive control before the move.
    assert.equal((await visibleReferences(runtime, claim.id)).length, 1);
    await admin`update claim set access_tenant_id = ${foreignTenant} where id = ${claim.id}`;
    const claimVisible = (scope: object) =>
      restricted(runtime, tx => tx`select id from claim where id = ${claim.id}`, scope);
    // KS settings: neither the claim nor the side row.
    assert.equal((await claimVisible({})).length, 0);
    assert.equal((await visibleReferences(runtime, claim.id)).length, 0);
    // MK settings: the claim is MK's to see; the side row keeps tenant KS and stays hidden.
    const mk = { home: foreignTenant };
    assert.equal((await claimVisible(mk)).length, 1);
    assert.equal((await visibleReferences(runtime, claim.id, mk)).length, 0);
  });

  await t.test('the side row disappears with its claim', async () => {
    const claim = await insertClaim(admin);
    await restricted(runtime, tx => insertCaseFields(tx, caseFields(claim)));
    await admin`delete from claim where id = ${claim.id}`;
    const left = await admin`select 1 from claim_case_fields where claim_id = ${claim.id}`;
    assert.equal(left.length, 0);
  });
}

test('WP-12 case fields: effective grants of the runtime role after migration', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);
  await withScratchDatabase('wp12_grants', async admin => {
    const role = quoteIdentifier(runtimeRole);
    const [existing] = await admin`select 1 from pg_roles where rolname = ${runtimeRole}`;
    // The migration grants to the runtime role when it exists, as in every environment.
    if (!existing) await admin.unsafe(`create role ${role} nologin nosuperuser nobypassrls`);
    try {
      await migrateJournal(admin, fileURLToPath(new URL('../drizzle', import.meta.url)));
      const [table] = await admin`select
        has_table_privilege(${runtimeRole}, 'public.claim_case_fields', 'SELECT') as can_select,
        has_table_privilege(${runtimeRole}, 'public.claim_case_fields', 'INSERT') as can_insert,
        has_table_privilege(${runtimeRole}, 'public.claim_case_fields', 'UPDATE') as can_update_table,
        has_table_privilege(${runtimeRole}, 'public.claim_case_fields', 'DELETE') as can_delete,
        has_table_privilege(${runtimeRole}, 'public.claim_case_fields', 'TRUNCATE') as can_truncate`;
      assert.deepEqual(table, {
        can_select: true,
        can_insert: true,
        can_update_table: false,
        can_delete: false,
        can_truncate: false,
      });
      const columns = await admin<{ column: string; can_update: boolean }[]>`
        select column_name as column,
          has_column_privilege(${runtimeRole}, 'public.claim_case_fields', column_name, 'UPDATE') as can_update
        from information_schema.columns
        where table_schema = 'public' and table_name = 'claim_case_fields'
        order by column_name`;
      assert.deepEqual(
        columns.filter(column => column.can_update).map(column => column.column),
        [
          'case_follow_up_at',
          'coverage_verification_status',
          'insurance_proof_reference',
          'other_vehicle_country_code',
          'outside_handling_party',
          'updated_at',
          'updated_by_staff_id',
        ]
      );
    } finally {
      if (!existing) {
        await admin.unsafe(`drop owned by ${role}`);
        await admin.unsafe(`drop role ${role}`);
      }
    }
  });
});
