import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRlsRoleIdentifier,
  assertRlsConnectionRole,
  evaluateRlsConnectionRolePosture,
  RlsConnectionRoleAssertionError,
} from '../src/rls-role-assertion';

test('RLS role assertion accepts a role that cannot bypass row-level security', async () => {
  const result = await assertRlsConnectionRole({
    isProduction: true,
    queryRolePosture: async () => [
      {
        currentUser: 'interdomestik_rls',
        roleBypassesRls: false,
        roleIsSuperuser: false,
      },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    currentUser: 'interdomestik_rls',
    roleBypassesRls: false,
    roleIsSuperuser: false,
  });
});

test('RLS role assertion rejects a production role that can bypass row-level security', async () => {
  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        queryRolePosture: async () => [
          {
            currentUser: 'postgres',
            roleBypassesRls: true,
            roleIsSuperuser: false,
          },
        ],
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match(
        (error as Error).message,
        /DATABASE_URL_RLS role postgres can bypass row-level security; refusing startup/u
      );
      return true;
    }
  );
});

test('RLS role assertion rejects a production superuser role', async () => {
  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        queryRolePosture: async () => [
          {
            currentUser: 'postgres',
            roleBypassesRls: false,
            roleIsSuperuser: true,
          },
        ],
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match(
        (error as Error).message,
        /DATABASE_URL_RLS role postgres can bypass row-level security; refusing startup/u
      );
      return true;
    }
  );
});

test('RLS role assertion rejects production when the role posture is missing', async () => {
  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        queryRolePosture: async () => [],
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match(
        (error as Error).message,
        /DATABASE_URL_RLS role posture was missing or malformed/u
      );
      return true;
    }
  );
});

test('RLS role assertion rejects production when posture verification fails', async () => {
  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        queryRolePosture: async () => {
          throw new Error('database unavailable');
        },
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match((error as Error).message, /could not be verified/u);
      return true;
    }
  );
});

test('RLS role assertion rejects production when posture verification times out', async () => {
  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        timeoutMs: 1,
        queryRolePosture: () => new Promise(() => undefined),
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match((error as Error).message, /could not be verified/u);
      return true;
    }
  );
});

test('RLS role assertion checks DB_RLS_ROLE when configured', async () => {
  const checkedRoles: Array<string | undefined> = [];
  const result = await assertRlsConnectionRole({
    isProduction: true,
    configuredDbRole: 'interdomestik_runtime_rls',
    queryRolePosture: async roleName => {
      checkedRoles.push(roleName);
      return [
        {
          currentUser: 'interdomestik_app',
          roleName: roleName ?? 'interdomestik_app',
          roleBypassesRls: false,
          roleIsSuperuser: false,
        },
      ];
    },
  });

  assert.deepEqual(checkedRoles, [undefined, 'interdomestik_runtime_rls']);
  assert.deepEqual(result, {
    ok: true,
    currentUser: 'interdomestik_app',
    configuredDbRole: 'interdomestik_runtime_rls',
    roleBypassesRls: false,
    roleIsSuperuser: false,
  });
});

test('RLS role assertion rejects production when DB_RLS_ROLE can bypass row-level security', async () => {
  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        configuredDbRole: 'postgres',
        queryRolePosture: async roleName => [
          {
            currentUser: 'interdomestik_app',
            roleName: roleName ?? 'interdomestik_app',
            roleBypassesRls: roleName === 'postgres',
            roleIsSuperuser: false,
          },
        ],
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match(
        (error as Error).message,
        /DATABASE_URL_RLS DB_RLS_ROLE target postgres can bypass row-level security/u
      );
      return true;
    }
  );
});

test('RLS role assertion rejects production when DB_RLS_ROLE is a superuser', async () => {
  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        configuredDbRole: 'postgres',
        queryRolePosture: async roleName => [
          {
            currentUser: 'interdomestik_app',
            roleName: roleName ?? 'interdomestik_app',
            roleBypassesRls: false,
            roleIsSuperuser: roleName === 'postgres',
          },
        ],
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match(
        (error as Error).message,
        /DATABASE_URL_RLS DB_RLS_ROLE target postgres can bypass row-level security/u
      );
      return true;
    }
  );
});

test('RLS role assertion rejects production when DB_RLS_ROLE is missing from pg_roles', async () => {
  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        configuredDbRole: 'missing_role',
        queryRolePosture: async roleName =>
          roleName
            ? []
            : [
                {
                  currentUser: 'interdomestik_app',
                  roleName: 'interdomestik_app',
                  roleBypassesRls: false,
                  roleIsSuperuser: false,
                },
              ],
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match(
        (error as Error).message,
        /DATABASE_URL_RLS role posture was missing or malformed/u
      );
      return true;
    }
  );
});

test('RLS role assertion rejects invalid DB_RLS_ROLE before querying', async () => {
  let queryCount = 0;

  await assert.rejects(
    () =>
      assertRlsConnectionRole({
        isProduction: true,
        configuredDbRole: 'postgres; drop table claim',
        queryRolePosture: async () => {
          queryCount += 1;
          return [];
        },
      }),
    error => {
      assert.equal(error instanceof RlsConnectionRoleAssertionError, true);
      assert.match((error as Error).message, /DB_RLS_ROLE contains an invalid/u);
      return true;
    }
  );

  assert.equal(queryCount, 0);
});

test('RLS role assertion checks only the connection role when DB_RLS_ROLE is unset', async () => {
  const checkedRoles: Array<string | undefined> = [];

  await assertRlsConnectionRole({
    isProduction: true,
    queryRolePosture: async roleName => {
      checkedRoles.push(roleName);
      return [
        {
          currentUser: 'interdomestik_app',
          roleBypassesRls: false,
          roleIsSuperuser: false,
        },
      ];
    },
  });

  assert.deepEqual(checkedRoles, [undefined]);
});

test('assertRlsRoleIdentifier rejects unsafe role names', () => {
  assert.throws(
    () => assertRlsRoleIdentifier('postgres; drop table claim'),
    /Invalid DB role for RLS context/u
  );
});

test('RLS role posture evaluation treats malformed rows as unverifiable', () => {
  const result = evaluateRlsConnectionRolePosture([
    {
      currentUser: 'interdomestik_rls',
      roleBypassesRls: null,
      roleIsSuperuser: null,
    },
  ]);

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_role_posture',
    checkedRole: 'connection',
    currentUser: 'interdomestik_rls',
  });
});
