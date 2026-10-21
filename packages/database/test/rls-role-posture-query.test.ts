import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';

import postgres from 'postgres';

import {
  assertRlsConnectionRole,
  evaluateRlsConnectionRolePosture,
} from '../src/rls-role-assertion';
import {
  queryRlsRolePosture,
  RLS_ROLE_POSTURE_REJECTED_SQLSTATE,
} from '../src/rls-role-posture-query';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';

// Creates SUPERUSER/BYPASSRLS fixture roles, so it only ever targets a loopback database.
const databaseUrl = resolveLoopbackDatabaseUrl(process.env.DATABASE_URL);
const requireIntegration = process.env.REQUIRE_RLS_INTEGRATION === '1';
const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
const password = randomUUID();
const roles = {
  safe: `ida_posture_safe_${suffix}`,
  bypass: `ida_posture_bypass_${suffix}`,
  superuser: `ida_posture_super_${suffix}`,
} as const;
const hijackSchema = `ida_posture_hijack_${suffix}`;

// A replaced shared boolean parser: every bool column decodes as false.
const corruptedBoolParser = {
  bool: {
    to: 16,
    from: [16],
    serialize: (value: unknown) => (value ? 't' : 'f'),
    parse: () => false,
  },
};

function resolveLoopbackDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const { hostname } = new URL(value);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname) ? value : undefined;
  } catch {
    return undefined;
  }
}

type ClientOptions = { corruptBool?: boolean; searchPath?: string };

function connectAs(role: string, options: ClientOptions = {}): postgres.Sql {
  const url = new URL(databaseUrl!);
  url.username = role;
  url.password = password;
  return postgres(url.toString(), {
    max: 1,
    onnotice: () => undefined,
    ...(options.corruptBool ? { types: corruptedBoolParser } : {}),
    ...(options.searchPath ? { connection: { search_path: options.searchPath } } : {}),
  });
}

async function withClient<T>(
  role: string,
  options: ClientOptions,
  run: (client: postgres.Sql) => Promise<T>
): Promise<T> {
  const client = connectAs(role, options);
  try {
    return await run(client);
  } finally {
    await client.end({ timeout: 5 });
  }
}

function assertServerRejected(error: unknown): true {
  assert.equal((error as { code?: unknown }).code, RLS_ROLE_POSTURE_REJECTED_SQLSTATE);
  return true;
}

let admin: postgres.Sql | undefined;
let unavailableReason: string | undefined = databaseUrl
  ? undefined
  : 'A loopback DATABASE_URL is not configured';

function requireDatabase(t: TestContext): boolean {
  if (!unavailableReason) return true;
  if (requireIntegration) assert.fail(`RLS role posture proof required: ${unavailableReason}`);
  t.skip(unavailableReason);
  return false;
}

test.before(async () => {
  if (!databaseUrl) return;
  admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await admin`select 1`;
  } catch (error) {
    await admin.end({ timeout: 1 });
    admin = undefined;
    unavailableReason = `loopback database unreachable: ${(error as Error).message}`;
    return;
  }
  const pw = quoteSqlLiteral(password);
  await admin.unsafe(`
    create role ${quoteIdentifier(roles.safe)} login nosuperuser nobypassrls password ${pw};
    create role ${quoteIdentifier(roles.bypass)} login nosuperuser bypassrls password ${pw};
    create role ${quoteIdentifier(roles.superuser)} login superuser password ${pw};
    create schema ${quoteIdentifier(hijackSchema)};
    create view ${quoteIdentifier(hijackSchema)}.pg_roles as
      select rolname, false as rolbypassrls, false as rolsuper from pg_catalog.pg_roles;
    create function ${quoteIdentifier(hijackSchema)}.always_one(integer, integer)
      returns integer language sql immutable as 'select 1';
    create operator ${quoteIdentifier(hijackSchema)}./ (
      leftarg = integer, rightarg = integer,
      function = ${quoteIdentifier(hijackSchema)}.always_one
    );
    grant usage on schema ${quoteIdentifier(hijackSchema)} to public;
    grant select on ${quoteIdentifier(hijackSchema)}.pg_roles to public;
  `);
});

test.after(async () => {
  if (!admin) return;
  await admin.unsafe(`
    drop schema if exists ${quoteIdentifier(hijackSchema)} cascade;
    drop role if exists ${quoteIdentifier(roles.safe)};
    drop role if exists ${quoteIdentifier(roles.bypass)};
    drop role if exists ${quoteIdentifier(roles.superuser)};
  `);
  await admin.end({ timeout: 5 });
});

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
      Array<{ currentUser: string; roleBypassesRls: boolean; roleIsSuperuser: boolean }>
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

test('DB_RLS_ROLE target and login role must both be unable to bypass RLS', async t => {
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
