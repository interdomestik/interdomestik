import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { setTimeout as poll } from 'node:timers/promises';
import { inspect } from 'node:util';

import { sql } from 'drizzle-orm';

import { assertDisposableUrl } from '../src/disposable-client';
import { mintTenantAuthority } from '../src/tenant-authority';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import {
  KS_TENANT_ID,
  openS8RestrictedSession,
  type S8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

type AdminDb = S8RestrictedSession['adminDb'];
type AdminTx = Parameters<Parameters<AdminDb['transaction']>[0]>[0];
type Authority = ReturnType<typeof mintTenantAuthority>;

const TABLE_PRIVILEGES = new Set(['select', 'insert', 'update', 'delete']);

/**
 * R-13: these tests write to the database they are given, so the target is checked (a loopback
 * database or the confirmed CI container) before any connection opens. Then the shared restricted
 * session opens; null when the test was skipped.
 */
export async function openActivitySession(
  t: TestContext,
  extraEnv: Record<string, string> = {}
): Promise<S8RestrictedSession | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) assertDisposableUrl(databaseUrl);
  return openS8RestrictedSession(t, extraEnv);
}

/** Runs one privilege statement built from quoted identifiers. */
const run = (tx: AdminTx, text: string) => tx.execute(sql.raw(text));

/**
 * The runtime role holds SELECT, INSERT, UPDATE and DELETE on every table
 * (`scripts/e2e-runtime-role.mjs`); a locking read (`FOR SHARE`) needs UPDATE besides SELECT.
 * The restricted test role gets the privileges a test exercises. In one transaction, only the
 * table privileges it does not already hold are granted; the returned step, also one
 * transaction, revokes exactly those. PostgreSQL's table-level REVOKE also drops column grants
 * of the same privilege, so a privilege the role holds on any column of the table, from any
 * grantor, is refused before anything is granted: a cleanup can then never remove a grant the
 * role held before. Every attribute counts, system columns (`ctid`) and dropped ones included,
 * and privilege names are compared as the catalog spells them (upper case, no case folding, which
 * a database locale could change).
 */
export async function grantTablePrivileges(
  adminDb: AdminDb,
  grants: ReadonlyArray<readonly [privileges: string, table: string]>
): Promise<() => Promise<void>> {
  const role = quoteIdentifier(TEST_DB_ROLE);
  const wanted = grants.flatMap(([privileges, table]) =>
    privileges.split(',').map(privilege => {
      const name = privilege.trim().toLowerCase();
      assert.ok(TABLE_PRIVILEGES.has(name), `unknown table privilege ${privilege}`);
      // JavaScript's toUpperCase does not depend on a locale; `aclexplode` reports this spelling.
      return { privilege: name, catalogName: name.toUpperCase(), table };
    })
  );
  const target = (table: string) => `public.${quoteIdentifier(table)}`;
  const added = await adminDb.transaction(async tx => {
    const state = await tx.execute<{ held: boolean; columns: number }>(sql`
      select
        has_table_privilege(${TEST_DB_ROLE}, format('public.%I', item.name), item.privilege)
          as held,
        (select count(*)::int
          from pg_attribute a
          cross join lateral aclexplode(a.attacl) acl
          where a.attrelid = format('public.%I', item.name)::regclass
            and acl.grantee = (select oid from pg_roles where rolname = ${TEST_DB_ROLE})
            and acl.privilege_type = item.privilege) as columns
      from unnest(
        array[${sql.join(
          wanted.map(item => sql`${item.table}`),
          sql`, `
        )}]::text[],
        array[${sql.join(
          wanted.map(item => sql`${item.catalogName}`),
          sql`, `
        )}]::text[]
      ) with ordinality as item(name, privilege, position)
      order by item.position`);
    const missing = wanted.filter((_item, index) => !state[index]?.held);
    for (const item of missing) {
      const columns = state[wanted.indexOf(item)]?.columns ?? 0;
      assert.equal(
        columns,
        0,
        `${TEST_DB_ROLE} holds column-level ${item.privilege} on ${item.table}; refusing a table grant its cleanup would remove`
      );
    }
    await inSequence(
      missing.map(
        item => () => run(tx, `grant ${item.privilege} on table ${target(item.table)} to ${role}`)
      )
    );
    return missing;
  });
  return () =>
    adminDb.transaction(tx =>
      inSequence(
        added.map(
          item => () =>
            run(tx, `revoke ${item.privilege} on table ${target(item.table)} from ${role}`)
        )
      )
    );
}

/** Runs the steps one after another (grants on one connection must not race). */
export async function inSequence(steps: ReadonlyArray<() => Promise<unknown>>): Promise<void> {
  await steps.reduce<Promise<unknown>>((previous, step) => previous.then(step), Promise.resolve());
}

/** A stable text order for comparing id lists. */
export const byText = (left: string, right: string) => left.localeCompare(right);

/** A session and the authority minted from it, as `authorizeSessionTenant` pairs them. */
export function actorIn(
  tenantId: string,
  userId: string,
  role: string,
  branchId: string | null = null
) {
  return {
    session: { user: { id: userId, role, tenantId, branchId } },
    authority: mintTenantAuthority({
      tenantId,
      accessTenantId: tenantId,
      purpose: 'test',
      principal: { userId, role, branchId, agentId: null },
    }),
  };
}

export const ksActor = (userId: string, role: string, branchId: string | null = null) =>
  actorIn(KS_TENANT_ID, userId, role, branchId);

export type Cleanups = ReadonlyArray<() => Promise<unknown>>;

/**
 * Runs the body, then every cleanup step the getter names at that moment (so steps registered
 * while the body ran are included); reports the first failure and logs the rest.
 */
export async function withCleanup(
  t: TestContext,
  body: () => Promise<void>,
  cleanups: () => Cleanups
): Promise<void> {
  const failures: unknown[] = [];
  try {
    await body();
  } catch (error) {
    failures.push(error);
  } finally {
    // Every step runs, in order, even after an earlier step failed.
    await inSequence(
      cleanups().map(
        cleanup => () =>
          cleanup().catch((error: unknown) => {
            failures.push(error);
          })
      )
    );
  }
  for (const error of failures.slice(1)) {
    t.diagnostic(`Additional cleanup failure: ${inspect(error)}`);
  }
  if (failures.length > 0) throw failures[0];
}

/**
 * Asserts the app connection is the restricted role (no superuser, no BYPASSRLS) and that
 * row-level security is active on each table. Call it only after the restricted session opened:
 * the app's database client reads its connection settings when first imported.
 */
export async function assertRestrictedPosture(
  authority: Authority,
  tables: readonly string[]
): Promise<void> {
  const { withTenantAuthority } = await import('../src/tenant-authority-context');
  await withTenantAuthority(authority, async tx => {
    const [posture] = await tx.execute<{
      currentUser: string;
      bypass: boolean;
      superuser: boolean;
    }>(sql`select current_user as "currentUser", rolbypassrls as bypass, rolsuper as superuser
      from pg_roles where rolname = current_user`);
    assert.deepEqual(posture, { currentUser: TEST_DB_ROLE, bypass: false, superuser: false });
    const names = sql.join(
      tables.map(table => sql`${table}`),
      sql`, `
    );
    const rows = await tx.execute<{ name: string; active: boolean }>(sql`
      select name, row_security_active(format('public.%I', name)::regclass) as active
      from unnest(array[${names}]::text[]) as name`);
    assert.deepEqual(
      rows.map(row => ({ name: row.name, active: row.active })),
      tables.map(name => ({ name, active: true })),
      'row-level security is active on every table'
    );
  });
}

/** A one-shot signal: `fired` settles once `fire` is called. */
function signal(): { fired: Promise<void>; fire: () => void } {
  // Assigned synchronously by the Promise executor below.
  let fire!: () => void;
  const fired = new Promise<void>(resolve => {
    fire = resolve;
  });
  return { fired, fire };
}

/**
 * R-17 race: a second connection (the admin's) runs `hold` in a transaction and keeps its row locks
 * while `act` starts. The restricted role's command must then wait on those locks (seen through
 * `pg_blocking_pids`, queried under `probe`) before the holder commits; `act`'s answer is returned
 * after the commit. Needs DB_MAX_CONNECTIONS of at least 2, for `act` and the probe.
 */
export async function raceAgainstHeldWrite<T>(options: {
  adminDb: AdminDb;
  probe: Authority;
  hold: (tx: AdminTx) => Promise<unknown>;
  act: () => Promise<T>;
}): Promise<T> {
  const { withTenantAuthority } = await import('../src/tenant-authority-context');
  const released = signal();
  const locked = signal();
  let holderPid = 0;
  const holder = options.adminDb.transaction(async tx => {
    await options.hold(tx);
    const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    holderPid = backend.pid;
    locked.fire();
    await released.fired;
  });
  const holderOutcome = holder.then(
    () => null,
    (error: unknown) => error
  );
  let action: Promise<T> | null = null;
  try {
    await Promise.race([locked.fired, holder]);
    action = options.act();
    // The command's locking read waits on the held row before it decides.
    const deadline = Date.now() + 5000;
    const waitUntilBlocked = async (): Promise<void> => {
      const blocked = await withTenantAuthority(options.probe, tx =>
        tx.execute<{ pid: number }>(sql`select pid from pg_stat_activity
          where usename = ${TEST_DB_ROLE} and state = 'active'
            and ${holderPid}::int = any(pg_blocking_pids(pid))`)
      );
      if (blocked.length === 1) return;
      assert.ok(Date.now() < deadline, 'the command must block on the held row');
      await poll(20);
      await waitUntilBlocked();
    };
    await waitUntilBlocked();
    released.fire();
    assert.equal(await holderOutcome, null, 'the held write commits');
    return await action;
  } finally {
    released.fire();
    await Promise.allSettled([holderOutcome, action ?? Promise.resolve()]);
  }
}
