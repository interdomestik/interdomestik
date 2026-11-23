import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import type postgres from 'postgres';

import registry from '../src/legal-document-versions.json';
import { quoteIdentifier } from './rls-test-connection';
import { migrateJournal, scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';

const runtime = 'interdomestik_runtime_rls';
const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));
const tenant = 'wp13_fixture_tenant_a';
const foreignTenant = 'wp13_fixture_tenant_b';
const member = 'wp13_fixture_member_a';
const peer = 'wp13_fixture_member_b';
const foreign = 'wp13_fixture_member_c';
const [version] = registry;

type Context = readonly [tenant?: string, actor?: string, role?: string];

function restricted<T>(
  client: postgres.Sql,
  databaseRole: string,
  context: Context,
  run: (tx: postgres.TransactionSql) => Promise<T>
) {
  return client.begin(async tx => {
    await tx.unsafe(`set local role ${quoteIdentifier(databaseRole)}`);
    const [tenantId, actor, role] = context;
    if (tenantId) await tx`select set_config('app.current_access_tenant_id', ${tenantId}, true)`;
    if (actor) await tx`select set_config('app.current_actor_id', ${actor}, true)`;
    if (role) await tx`select set_config('app.current_actor_role', ${role}, true)`;
    return run(tx);
  });
}

function append(
  tx: postgres.TransactionSql,
  tenantId: string,
  actor: string,
  digest = version.textSha256
) {
  return tx`
    insert into legal_acceptances (id, tenant_id, subject_user_id, document_kind, document_version,
      locale, text_sha256, source_surface, accepted_at)
    values (${randomUUID()}, ${tenantId}, ${actor}, ${version.kind}, ${version.version},
      ${version.locale}, ${digest}, 'member_activation', '1900-01-01'::timestamptz)
    on conflict (tenant_id, subject_user_id, document_kind, document_version) do nothing
    returning subject_user_id, accepted_at >= transaction_timestamp() as stamped
  `;
}

function denied(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return (
    error.code === '42501' ||
    (error.code === '23514' && error instanceof Error && error.message.startsWith('WP-13:'))
  );
}

async function seedSubjects(admin: postgres.Sql) {
  for (const id of [tenant, foreignTenant]) {
    await admin`insert into tenants (id, name, legal_name, country_code) values (${id}, 'Fixture', 'Fixture', 'MK')`;
  }
  for (const [id, tenantId] of [
    [member, tenant],
    [peer, tenant],
    [foreign, foreignTenant],
  ]) {
    const email = `${id}@example.test`;
    await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      values (${id}, ${tenantId}, 'Acceptance fixture', ${email}, true, 'member', now(), now())`;
  }
}

async function provePolicy(t: TestContext, admin: postgres.Sql) {
  const own = (who: string = member) => [tenant, who, 'member'] as const;
  const read = (tx: postgres.TransactionSql) =>
    tx`select subject_user_id from legal_acceptances order by subject_user_id`;
  const run = <T>(context: Context, work: (tx: postgres.TransactionSql) => Promise<T>) =>
    restricted(admin, runtime, context, work);

  await assert.rejects(
    run(own(), tx => append(tx, tenant, peer)),
    denied
  );
  await assert.rejects(
    run(own(), tx => append(tx, foreignTenant, foreign)),
    denied
  );
  await assert.rejects(
    run(own(), tx => append(tx, tenant, member, '0'.repeat(64))),
    (error: unknown) => {
      assert.ok(error instanceof Error && 'code' in error && 'constraint_name' in error);
      assert.equal(error.code, '23503');
      assert.equal(error.constraint_name, 'legal_acceptances_text_fk');
      assert.match(error.message, /violates foreign key constraint "legal_acceptances_text_fk"/u);
      return true;
    }
  );

  const inserted = await run(own(), tx => append(tx, tenant, member));
  assert.deepEqual([...inserted], [{ subject_user_id: member, stamped: true }]);
  assert.equal((await run(own(), tx => append(tx, tenant, member))).length, 0);
  await run(own(peer), tx => append(tx, tenant, peer));
  await run([foreignTenant, foreign, 'member'], tx => append(tx, foreignTenant, foreign));
  assert.deepEqual([...(await run(own(), read))], [{ subject_user_id: member }]);
  assert.deepEqual(
    [...(await run([tenant, member, 'tenant_admin'], read))],
    [{ subject_user_id: member }, { subject_user_id: peer }]
  );

  for (const context of [[], [tenant], [tenant, member], [tenant, undefined, 'member']] as const) {
    await t.test(
      `refuses partial context ${JSON.stringify(context)} on reused connection`,
      async () => {
        assert.equal((await run(context, read)).length, 0);
        await assert.rejects(
          run(context, tx => append(tx, tenant, member)),
          denied
        );
      }
    );
  }

  const policies = await admin<{ name: string; predicate: string }[]>`
    select policyname as name, coalesce(qual, with_check) as predicate
    from pg_policies where schemaname = 'public' and tablename = 'legal_acceptances'
    order by policyname
  `;
  assert.equal(policies.length, 2);
  for (const policy of policies) {
    assert.match(
      policy.predicate,
      /tenant_id\s*=.*current_setting\('app.current_access_tenant_id'/u,
      policy.name
    );
    assert.match(policy.predicate, /app\.current_actor_id/u, policy.name);
    assert.match(policy.predicate, /app\.current_actor_role/u, policy.name);
  }
}

async function proveRegistryRead(admin: postgres.Sql, role: string) {
  await restricted(admin, role, [], async tx => {
    const [posture] = await tx`
      select relrowsecurity, row_security_active(oid::regclass) as active
      from pg_class where oid = 'public.legal_document_versions'::regclass
    `;
    assert.deepEqual(posture, { relrowsecurity: true, active: true }, role);

    const rows = await tx`
      select text_sha256 from public.legal_document_versions
      where kind = ${version.kind} and version = ${version.version} and locale = ${version.locale}
    `;
    assert.deepEqual([...rows], [{ text_sha256: version.textSha256 }], role);
  });
}

async function proveMutationDenials(t: TestContext, admin: postgres.Sql, role: string) {
  const privileges = await admin`
    select table_name, privilege, has_table_privilege(${role}, table_name, privilege) as granted
    from unnest(array['legal_document_versions','legal_acceptances']) as table_name
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) as privilege
    order by table_name, privilege
  `;
  t.diagnostic(JSON.stringify({ role, privileges }));
  const statements = [
    "insert into legal_document_versions (kind,version,locale,text_sha256,review_status) values ('terms','fixture-unregistered','en',repeat('a',64),'approved')",
    "update legal_document_versions set review_status = 'approved' where kind = 'terms'",
    "delete from legal_document_versions where kind = 'terms'",
    'truncate legal_document_versions, legal_acceptances',
    "update legal_acceptances set accepted_at = now() where subject_user_id = 'wp13_fixture_member_a'",
    "delete from legal_acceptances where subject_user_id = 'wp13_fixture_member_a'",
    'truncate legal_acceptances',
  ];
  for (const statement of statements) {
    await assert.rejects(
      restricted(admin, role, [tenant, member, 'member'], tx => tx.unsafe(statement)),
      denied
    );
  }
}

test('WP-13a journal policies and append-only controls under restricted roles', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  await withScratchDatabase('wp13_acceptance', async admin => {
    const e2e = `wp13_e2e_${randomUUID().slice(0, 8)}`;
    const [existing] = await admin`select 1 from pg_roles where rolname = ${runtime}`;
    if (!existing) await admin.unsafe(`create role ${runtime} nologin nosuperuser nobypassrls`);
    await admin.unsafe(`create role ${quoteIdentifier(e2e)} nologin nosuperuser nobypassrls`);
    try {
      await migrateJournal(admin, migrations);
      await admin.unsafe(`grant usage on schema public to ${runtime}, ${quoteIdentifier(e2e)}`);
      // Reproduce the production e2e-runtime-role.mjs DML grant, including its lack of TRUNCATE.
      await admin.unsafe(
        `grant select, insert, update, delete on all tables in schema public to ${quoteIdentifier(e2e)}`
      );
      await seedSubjects(admin);
      await provePolicy(t, admin);
      for (const role of [runtime, e2e]) {
        await proveRegistryRead(admin, role);
        await proveMutationDenials(t, admin, role);
      }
      const [cleanupRole] =
        await admin`select 1 from pg_roles where rolname = 'interdomestik_seed_cleanup'`;
      if (!cleanupRole) {
        await assert.rejects(
          admin`delete from legal_acceptances where tenant_id = ${tenant}`,
          denied
        );
      }
    } finally {
      await admin.unsafe(`drop owned by ${quoteIdentifier(e2e)}`);
      await admin.unsafe(`drop role ${quoteIdentifier(e2e)}`);
      if (!existing) {
        await admin.unsafe(`drop owned by ${runtime}`);
        await admin.unsafe(`drop role ${runtime}`);
      }
    }
  });
});
