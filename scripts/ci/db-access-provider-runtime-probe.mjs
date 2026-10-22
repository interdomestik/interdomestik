import { runRestrictedProviderFixture } from './db-access-provider-runtime-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const settings =
  'pg_backend_pid() as pid,session_user::text as login,current_user::text as effective, ' +
  "coalesce(current_setting('app.current_tenant_id',true),'') as tenant, " +
  "coalesce(current_setting('app.current_access_tenant_id',true),'') as access, " +
  "coalesce(current_setting('app.user_role',true),'') as actor";
const code = value => value?.code ?? value?.cause?.code;
const snapshot = async executor => (await executor.execute(sql.raw('select ' + settings)))[0];

async function child(mode) {
  const schema = process.env.PROVIDER_PROOF_SCHEMA;
  assert.match(schema, /^s8_native_[a-f0-9]{16}$/);
  let foreign;
  if (mode === 'preloaded') {
    foreign = postgres(process.env.DATABASE_URL_RLS, { max: 1, ssl: false });
    globalThis.queryClientRls = foreign;
  }
  let provider;
  try {
    provider = await import('./packages/database/src/db.js');
  } catch (error) {
    if (mode !== 'preloaded') throw error;
    assert.match(error.message, /preexisting global database clients/);
    assert.equal((await foreign.unsafe('select 1 as alive'))[0].alive, 1);
    await foreign.end({ timeout: 1 });
    return { preloadedRefused: true, foreignConnectionPreserved: true };
  }
  const { withTenantContext } = await import('./packages/database/src/tenant.js');
  let callbacks = 0;
  if (mode === 'unsafe') {
    await assert.rejects(
      () =>
        withTenantContext({ tenantId: 'tenant_a' }, async () => {
          callbacks++;
        }),
      error =>
        error.name === 'RlsConnectionRoleAssertionError' &&
        error.result?.reason === 'role_bypasses_rls' &&
        error.result?.checkedRole === process.env.PROVIDER_PROOF_EXPECTED_REFUSAL &&
        code(error.result?.cause) === '22012'
    );
    assert.equal(callbacks, 0);
    return { unsafeRefused: true, callbacks };
  }
  assert.equal(mode, 'positive');
  await provider.assertRlsConnectionRoleReady();
  const before = await snapshot(provider.dbRls);
  assert.equal(before.login, process.env.PROVIDER_PROOF_EXPECTED_LOGIN);
  assert.equal(before.effective, before.login);
  assert.deepEqual([before.tenant, before.access, before.actor], ['', '', '']);
  const context = { tenantId: 'tenant_a', accessTenantId: 'access_a', role: 'staff' };
  let transactionPid;
  await assert.rejects(
    () =>
      withTenantContext(context, async tx => {
        callbacks++;
        const inside = await snapshot(tx);
        transactionPid = inside.pid;
        assert.equal(inside.pid, before.pid);
        assert.equal(inside.login, before.login);
        assert.equal(inside.effective, process.env.DB_RLS_ROLE);
        assert.deepEqual(
          [inside.tenant, inside.access, inside.actor],
          ['tenant_a', 'access_a', 'staff']
        );
        const rows = await tx.execute(
          sql.raw('select tenant_id from "' + schema + '".facts order by tenant_id')
        );
        assert.deepEqual(
          rows.map(row => row.tenant_id),
          ['tenant_a']
        );
        await tx.execute(
          sql.raw(
            'insert into "' +
              schema +
              "\".writes values ('tenant_a','rollback-one'),('tenant_a','rollback-two')"
          )
        );
        await tx.execute(sql.raw('select 1/0'));
      }),
    error => code(error) === '22012'
  );
  const afterRollback = await snapshot(provider.dbRls);
  assert.equal(afterRollback.pid, transactionPid);
  assert.equal(afterRollback.effective, before.login);
  assert.deepEqual([afterRollback.tenant, afterRollback.access, afterRollback.actor], ['', '', '']);
  const rolledBack = await withTenantContext(context, tx =>
    tx.execute(sql.raw('select count(*)::int as count from "' + schema + '".writes'))
  );
  assert.equal(rolledBack[0].count, 0);
  const tenantB = await withTenantContext({ tenantId: 'tenant_b', role: 'agent' }, async tx => {
    const inside = await snapshot(tx);
    assert.equal(inside.pid, before.pid);
    assert.deepEqual(
      [inside.tenant, inside.access, inside.actor],
      ['tenant_b', 'tenant_b', 'agent']
    );
    return tx.execute(sql.raw('select tenant_id from "' + schema + '".facts'));
  });
  assert.deepEqual(
    tenantB.map(row => row.tenant_id),
    ['tenant_b']
  );
  const afterCommit = await snapshot(provider.dbRls);
  assert.equal(afterCommit.pid, before.pid);
  assert.equal(afterCommit.effective, before.login);
  assert.deepEqual([afterCommit.tenant, afterCommit.access, afterCommit.actor], ['', '', '']);
  await assert.rejects(
    () => provider.dbRls.execute(sql.raw('set role postgres')),
    error => code(error) === '42501'
  );
  await provider.dbRls.execute(sql.raw('set role none'));
  assert.equal((await snapshot(provider.dbRls)).effective, before.login);
  await provider.dbRls.execute(sql.raw('reset role'));
  assert.equal((await snapshot(provider.dbRls)).effective, before.login);
  const closure =
    'with recursive membership as (' +
    'select oid,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_catalog.pg_roles where rolname=session_user ' +
    'union select r.oid,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb from membership p ' +
    'join pg_catalog.pg_auth_members m on m.member=p.oid join pg_catalog.pg_roles r on r.oid=m.roleid) ';
  const [privilege] = await provider.dbRls.execute(
    sql.raw(
      closure +
        'select count(*)::int as roles,count(*) filter(where rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)::int as unsafe from membership'
    )
  );
  assert.equal(privilege.roles, 2);
  assert.equal(privilege.unsafe, 0);
  const [ownership] = await provider.dbRls.execute(
    sql.raw(
      closure +
        'select count(*)::int as count from pg_catalog.pg_class c join membership m on c.relowner=m.oid'
    )
  );
  assert.equal(ownership.count, 0);
  const [callables] = await provider.dbRls.execute(
    sql.raw(
      closure +
        'select count(distinct p.oid)::int as count from membership m cross join pg_catalog.pg_proc p ' +
        'join pg_catalog.pg_namespace n on n.oid=p.pronamespace ' +
        "where p.prosecdef and n.nspname not in ('pg_catalog','information_schema') " +
        "and pg_catalog.has_function_privilege(m.oid,p.oid,'EXECUTE')"
    )
  );
  assert.equal(callables.count, 0);
  globalThis.queryClientRls = { spoofed: true };
  assert.equal((await snapshot(provider.dbRls)).pid, before.pid);
  const { withOwnedTenantContext } =
    await import('./packages/database/src/owned-tenant-context.js');
  const owned = await withOwnedTenantContext('tenant_a', async tx => {
    const row = await snapshot(tx);
    assert.equal(row.login, before.login);
    assert.equal(row.effective, process.env.DB_RLS_ROLE);
    assert.deepEqual([row.tenant, row.access, row.actor], ['tenant_a', 'tenant_a', 'admin']);
    const rows = await tx.execute(sql.raw('select tenant_id from "' + schema + '".facts'));
    assert.deepEqual(
      rows.map(value => value.tenant_id),
      ['tenant_a']
    );
    return row;
  });
  assert.notEqual(owned.pid, before.pid);
  return {
    callbacks,
    sameBackendRollback: true,
    sameBackendCommit: true,
    cleanTenantAccessActorSettings: true,
    forcedRlsIsolation: true,
    loginAndTargetRestricted: true,
    escalationDenied: true,
    membershipRoles: privilege.roles,
    privilegedMemberships: privilege.unsafe,
    ownedRelations: ownership.count,
    callableNonSystemDefiners: callables.count,
    lateGlobalsIgnored: true,
    ownedPoolDistinct: true,
  };
}

if (process.argv[2] === 'child') {
  try {
    const result = await child(process.argv[3]);
    await new Promise((resolve, reject) =>
      process.stdout.write('PINNED_PROVIDER_RESULT ' + JSON.stringify(result) + '\n', error =>
        error ? reject(error) : resolve()
      )
    );
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
} else {
  test('fixed producer: real restricted LOGIN, private contexts, same-backend rollback and privilege refusals', () =>
    runRestrictedProviderFixture(import.meta.url));
}
