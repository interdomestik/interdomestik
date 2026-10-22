import assert from 'node:assert/strict';
import test from 'node:test';

import type postgres from 'postgres';

import {
  assertRlsConnectionRole,
  evaluateRlsConnectionRolePosture,
} from '../src/rls-role-assertion';
import { queryRlsRolePosture } from '../src/rls-role-posture-query';
import { quoteIdentifier } from './rls-role-posture-query.fixture';
import {
  admin,
  assertServerRejected,
  hijackSchema,
  requireDatabase,
  roles,
  suffix,
  withClient,
} from './rls-role-posture-query.fixture';

test('server-enforced posture accepts a NOSUPERUSER NOBYPASSRLS connection role', async t => {
  if (!requireDatabase(t)) return;
  await withClient(roles.safe, {}, async client => {
    const result = await assertRlsConnectionRole({
      isProduction: true,
      queryRolePosture: roleName => queryRlsRolePosture(client, roleName),
    });
    assert.equal(result.ok, true);
    assert.equal(result.currentUser, roles.safe);
  });
});

test('server-enforced posture refuses BYPASSRLS and SUPERUSER connection roles', async t => {
  if (!requireDatabase(t)) return;
  for (const role of [roles.bypass, roles.superuser]) {
    await withClient(role, {}, async client => {
      await assert.rejects(() => queryRlsRolePosture(client), assertServerRejected);
      const result = await assertRlsConnectionRole({
        isProduction: false,
        queryRolePosture: roleName => queryRlsRolePosture(client, roleName),
      });
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, 'role_bypasses_rls');
      assert.equal(!result.ok && result.checkedRole, 'connection');
    });
  }
});

test('a corrupted boolean parser fools the decoded check but not the server refusal', async t => {
  if (!requireDatabase(t)) return;
  await withClient(roles.bypass, { corruptBool: true }, async client => {
    // Negative control: the decoded-only check accepts a BYPASSRLS role under this parser.
    const decodedOnly = await client<
      Array<{
        currentUser: string;
        roleBypassesRls: boolean;
        roleIsSuperuser: boolean;
      }>
    >`
      select current_user as "currentUser", rolbypassrls as "roleBypassesRls",
        rolsuper as "roleIsSuperuser"
      from pg_catalog.pg_roles where rolname = current_user
    `;
    assert.equal(evaluateRlsConnectionRolePosture(decodedOnly).ok, true);

    await assert.rejects(() => queryRlsRolePosture(client), assertServerRejected);
    await assert.rejects(
      () =>
        assertRlsConnectionRole({
          isProduction: true,
          queryRolePosture: roleName => queryRlsRolePosture(client, roleName),
        }),
      /can bypass row-level security; refusing startup/u
    );
  });
});

test('search_path relations and operators cannot replace the catalog check', async t => {
  if (!requireDatabase(t)) return;
  const searchPath = `${quoteIdentifier(hijackSchema)}, pg_catalog`;
  await withClient(roles.bypass, { searchPath }, async client => {
    // Negative control: unqualified names resolve to the hijack schema first.
    const [hijacked] = await client<Array<{ bypass: boolean; quotient: number }>>`
      select rolbypassrls as bypass, 1 / 0 as quotient from pg_roles where rolname = current_user
    `;
    assert.deepEqual({ ...hijacked }, { bypass: false, quotient: 1 });

    await assert.rejects(() => queryRlsRolePosture(client), assertServerRejected);
  });
});

test('DB_RLS_ROLE target and effective connection role must both be unable to bypass RLS', async t => {
  if (!requireDatabase(t)) return;
  const assertWith = (client: postgres.Sql, configuredDbRole: string) =>
    assertRlsConnectionRole({
      isProduction: false,
      configuredDbRole,
      queryRolePosture: roleName => queryRlsRolePosture(client, roleName),
    });

  await withClient(roles.safe, { corruptBool: true }, async client => {
    const privilegedTarget = await assertWith(client, roles.bypass);
    assert.equal(privilegedTarget.ok, false);
    assert.equal(!privilegedTarget.ok && privilegedTarget.reason, 'role_bypasses_rls');
    assert.equal(!privilegedTarget.ok && privilegedTarget.checkedRole, 'configuredDbRole');
    assert.equal(!privilegedTarget.ok && privilegedTarget.configuredDbRole, roles.bypass);

    const safeTarget = await assertWith(client, roles.safe);
    assert.equal(safeTarget.ok, true);
  });

  await withClient(roles.superuser, { corruptBool: true }, async client => {
    await assert.rejects(() => queryRlsRolePosture(client, roles.safe), assertServerRejected);
  });
});

test('a missing DB_RLS_ROLE target yields no posture row', async t => {
  if (!requireDatabase(t)) return;
  await withClient(roles.safe, {}, async client => {
    assert.deepEqual([...(await queryRlsRolePosture(client, `ida_absent_${suffix}`))], []);
  });
});

test('a privileged login remains refused after selecting a restricted startup role', async t => {
  if (!requireDatabase(t)) return;
  await withClient(roles.superuser, { corruptBool: true, setRole: roles.safe }, async client => {
    await assert.rejects(() => queryRlsRolePosture(client, roles.safe), assertServerRejected);
    const result = await assertRlsConnectionRole({
      isProduction: false,
      configuredDbRole: roles.safe,
      queryRolePosture: roleName => queryRlsRolePosture(client, roleName),
    });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.reason, 'role_bypasses_rls');
    assert.equal(!result.ok && result.checkedRole, 'connection');
    await assert.rejects(
      () =>
        assertRlsConnectionRole({
          isProduction: true,
          configuredDbRole: roles.safe,
          queryRolePosture: roleName => queryRlsRolePosture(client, roleName),
        }),
      /can bypass row-level security; refusing startup/u
    );
    await client`SET ROLE NONE`;
    const [restored] = await client`select session_user as "login", current_user as "effective"`;
    assert.deepEqual({ ...restored }, { login: roles.superuser, effective: roles.superuser });
    await assert.rejects(() => queryRlsRolePosture(client, roles.safe), assertServerRejected);
  });

  await withClient(roles.superuser, { corruptBool: true, setRole: roles.bypass }, async client => {
    await assert.rejects(() => queryRlsRolePosture(client), assertServerRejected);
  });
});

test('restricted login selects a different restricted role and cannot regain privilege', async t => {
  if (!requireDatabase(t)) return;
  const target = `ida_posture_target_${suffix}`;
  await admin!.unsafe(`
    create role ${quoteIdentifier(target)} nologin nosuperuser nobypassrls nocreaterole nocreatedb noinherit;
    grant ${quoteIdentifier(target)} to ${quoteIdentifier(roles.safe)};
  `);
  try {
    await withClient(roles.safe, { setRole: target }, async client => {
      const identity = async () => {
        const [row] = await client`select session_user as "login", current_user as "effective"`;
        return { ...row };
      };
      assert.deepEqual(await identity(), {
        login: roles.safe,
        effective: target,
      });
      const result = await assertRlsConnectionRole({
        isProduction: true,
        configuredDbRole: target,
        queryRolePosture: roleName => queryRlsRolePosture(client, roleName),
      });
      assert.equal(result.ok, true);
      assert.equal(result.currentUser, target);
      await assert.rejects(
        () => client`SET ROLE postgres`,
        error => {
          assert.equal((error as { code?: unknown }).code, '42501');
          return true;
        }
      );
      await client`SET ROLE NONE`;
      assert.deepEqual(await identity(), {
        login: roles.safe,
        effective: roles.safe,
      });
      await queryRlsRolePosture(client, target);
      await client`RESET ROLE`;
      assert.deepEqual(await identity(), {
        login: roles.safe,
        effective: target,
      });
      await queryRlsRolePosture(client, target);
    });
  } finally {
    await admin!.unsafe(`
      revoke ${quoteIdentifier(target)} from ${quoteIdentifier(roles.safe)};
      drop role ${quoteIdentifier(target)};
    `);
  }
});
