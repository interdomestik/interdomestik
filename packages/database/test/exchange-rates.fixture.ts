import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as poll } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

import { withDisposableClient } from '../src/disposable-client';
import { mintTenantAuthority, type TenantAuthority } from '../src/tenant-authority';
import { mintIngressCapability } from '../src/ingress-capability';
import type { TenantTransaction } from '../src/index';
import * as schema from '../src/schema';
import { migrateJournal, withScratchDatabase } from './pg16/scratch-database';
import {
  applyRlsTestConnectionEnv,
  quoteIdentifier,
  quoteSqlLiteral,
  TEST_DB_ROLE,
} from './rls-test-connection';
import { grantRlsTestRole } from './rls-test-grants';
import { provisionRestrictedRole } from './s8-claim-restricted-rls.fixture';

export const tables = ['exchange_rate_books', 'exchange_rates'] as const;
export const runtimeRole = 'interdomestik_runtime_rls';
export const paymentPortTestGuardRole = TEST_DB_ROLE;
const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));
export const rateInput = (effectiveOn: string) => ({
  base: 'EUR',
  quote: 'MKD',
  rate: '61.5',
  effectiveOn,
});

export type RateRow = {
  id: string;
  caller_kind: string;
  stored_by: string | null;
  effective_on: string;
  week_starts_on: string;
  revision: number;
  corrects_rate_id: string | null;
};

export function firstRate(tenantId: string, bookId: string, effectiveOn = '2026-01-07') {
  return {
    id: randomUUID(),
    tenant_id: tenantId,
    book_id: bookId,
    base: 'EUR',
    quote: 'MKD',
    rate: '61.5',
    effective_on: effectiveOn,
    week_starts_on: null as string | null,
    revision: 1,
    corrects_rate_id: null as string | null,
    correction_reason: null as string | null,
    source: 'nbrm',
    caller_kind: 'inngest',
    stored_by: null as string | null,
  };
}

export function insertRate(tx: postgres.TransactionSql, rate: ReturnType<typeof firstRate>) {
  return tx<RateRow[]>`insert into exchange_rates ${tx(rate)}
    returning id, caller_kind, stored_by, effective_on::text, week_starts_on::text, revision, corrects_rate_id`;
}

export function restricted<T>(
  client: postgres.Sql,
  accessTenant: string | undefined,
  run: (tx: postgres.TransactionSql) => Promise<T>,
  roleName = runtimeRole,
  isolation: 'read committed' | 'repeatable read' = 'read committed'
) {
  return client.begin(`isolation level ${isolation}`, async tx => {
    await tx.unsafe(`set local role ${quoteIdentifier(roleName)}`);
    await tx`set local row_security = on`;
    if (accessTenant !== undefined) {
      await tx`select set_config('app.current_access_tenant_id', ${accessTenant}, true),
        set_config('app.current_tenant_id', ${accessTenant}, true)`;
    }
    return run(tx);
  });
}

// Keep a transaction open until the contender has actually reached a PostgreSQL lock wait.
export async function waitForLockWaiters(client: postgres.Sql, blocker: number, count: number) {
  const deadline = Date.now() + 5000;
  do {
    const [row] = await client<{ waiting: number }[]>`
      with recursive waiters(pid) as (
        select ${blocker}::int
        union
        select activity.pid from pg_stat_activity activity
        join waiters on waiters.pid = any(pg_blocking_pids(activity.pid))
        where activity.datname = current_database()
      ) select count(*)::int - 1 as waiting from waiters`;
    if (row.waiting >= count) return;
    await poll(20);
  } while (Date.now() < deadline);
  assert.fail(`Expected ${count} PostgreSQL lock waiters for backend ${blocker}`);
}

export function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function withLockedBook<T>(
  holder: postgres.Sql,
  observer: postgres.Sql,
  tenantId: string,
  bookId: string,
  publishers: () => Promise<T>,
  count: number
) {
  const locked = signal();
  const release = signal();
  let blocker = 0;
  const held = restricted(holder, tenantId, async tx => {
    const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
    blocker = pid;
    const rows = await tx`select id from exchange_rate_books where id = ${bookId} for update`;
    assert.equal(rows.length, 1);
    locked.resolve();
    await release.promise;
    const [{ mark }] = await tx<{ mark: string }[]>`select clock_timestamp()::text as mark`;
    return mark;
  });

  let pending: Promise<T> | undefined;
  try {
    await Promise.race([locked.promise, held]);
    pending = publishers();
    await Promise.race([
      waitForLockWaiters(observer, blocker, count),
      pending.then(() => assert.fail('Publications finished while the book was locked')),
    ]);
    release.resolve();
    return { mark: await held, result: await pending };
  } finally {
    release.resolve();
    await Promise.allSettled([held, pending]);
  }
}

export type ExchangeRateFixture = Awaited<ReturnType<typeof createFixture>> & {
  peer: postgres.Sql;
};

async function withRuntimeLogin(
  admin: postgres.Sql,
  run: (username: string, password: string) => Promise<void>
) {
  const role = quoteIdentifier(runtimeRole);
  const [existing] = await admin`select 1 from pg_roles where rolname = ${runtimeRole}`;
  if (!existing) await admin.unsafe(`create role ${role} nologin nosuperuser nobypassrls`);

  try {
    const username = `wp07_rates_${randomUUID().replaceAll('-', '')}`;
    const login = quoteIdentifier(username);
    const password = randomUUID();
    await admin.begin(async tx => {
      await tx.unsafe(`create role ${login} login noinherit password ${quoteSqlLiteral(password)}`);
      await tx.unsafe(`grant ${role} to ${login}`);
    });
    try {
      await run(username, password);
    } finally {
      await admin.unsafe(`drop role ${login}`);
    }
  } finally {
    if (!existing) {
      await admin.unsafe(`drop owned by ${role}`);
      await admin.unsafe(`drop role ${role}`);
    }
  }
}

export type PaymentPortDatabase = { admin: postgres.Sql; peer: postgres.Sql };
export type PaymentPortTestTransaction = postgres.TransactionSql;

export { scratchServerMissing } from './pg16/scratch-database';

function requireTestRunner() {
  if (!process.env.NODE_TEST_CONTEXT && process.env.VITEST !== 'true') {
    throw new Error('Payment port fixtures require a test runner');
  }
}

export function mintPaymentPortTestIngress<T extends 'cron' | 'inngest'>(kind: T) {
  requireTestRunner();
  return mintIngressCapability(kind);
}

export function paymentPortTestScheduledAuthority(tenantId: string): TenantAuthority {
  requireTestRunner();
  return mintTenantAuthority({ tenantId, purpose: 'scheduled-work' });
}

export function paymentPortTestSession(
  tenantId: string,
  userId: string,
  role: string,
  branchId: string | null = null,
  accessTenantId = tenantId
): TenantAuthority {
  requireTestRunner();
  return mintTenantAuthority({
    tenantId,
    accessTenantId,
    purpose: 'session',
    principal: { userId, role, branchId, agentId: null },
  });
}

export async function withPaymentPortDatabase(
  run: (fixture: PaymentPortDatabase) => Promise<void>
) {
  requireTestRunner();
  // The scratch database owns all append-only rows and disappears after the proof.
  await withScratchDatabase('wp07_payment', admin =>
    withRuntimeLogin(admin, async (username, password) => {
      // Migration 0101 grants privileges to the runtime role when it exists.
      await migrateJournal(admin, migrations);
      const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = `/${name}`;

      const adminDb = drizzle(admin);
      await provisionRestrictedRole(adminDb);
      await grantRlsTestRole(adminDb, tables);
      // The append-only tests need permission to reach the mutation triggers.
      await admin.unsafe(
        `grant update, delete, truncate on exchange_rate_books, exchange_rates to ${quoteIdentifier(TEST_DB_ROLE)}`
      );
      const [acl] = await admin`select
        has_table_privilege(${runtimeRole}, 'exchange_rate_books', 'INSERT') as can_insert_book,
        has_table_privilege(${runtimeRole}, 'exchange_rates', 'INSERT') as can_insert_rate,
        has_column_privilege(${runtimeRole}, 'exchange_rate_books', 'id', 'UPDATE') as can_lock_book,
        has_table_privilege(${runtimeRole}, 'exchange_rate_books', 'UPDATE,DELETE,TRUNCATE')
          or has_table_privilege(${runtimeRole}, 'exchange_rates', 'UPDATE,DELETE,TRUNCATE') as can_mutate`;
      assert.deepEqual(acl, {
        can_insert_book: true,
        can_insert_rate: true,
        can_lock_book: true,
        can_mutate: false,
      });

      const env = applyRlsTestConnectionEnv(url.toString());
      const rlsUrl = new URL(url);
      rlsUrl.username = username;
      rlsUrl.password = password;
      process.env.DATABASE_URL_RLS = rlsUrl.toString();
      process.env.DB_RLS_ROLE = runtimeRole;
      const previousEnv = {
        DATABASE_URL: process.env.DATABASE_URL,
        DB_MAX_CONNECTIONS: process.env.DB_MAX_CONNECTIONS,
      };
      Object.assign(process.env, { DATABASE_URL: url.toString(), DB_MAX_CONNECTIONS: '4' });
      const pools = globalThis as typeof globalThis & {
        queryClientAdmin?: postgres.Sql;
        queryClientRls?: postgres.Sql;
      };
      try {
        await withDisposableClient(
          url.toString(),
          { applicationName: 'wp07_rates_peer', max: 2 },
          peer => run({ admin, peer })
        );
      } finally {
        env.restore();
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        // This isolated test file points the app's pools at the scratch database.
        await Promise.all(
          [...new Set([pools.queryClientAdmin, pools.queryClientRls])].map(pool =>
            pool?.end({ timeout: 1 })
          )
        );
      }
    })
  );
}

export function withPaymentPortTestTransaction<T>(
  client: postgres.Sql,
  tenantId: string,
  role: string,
  work: (tx: TenantTransaction) => Promise<T>,
  isolationLevel: 'read committed' | 'repeatable read'
) {
  requireTestRunner();
  return drizzle(client, { schema }).transaction(
    async tx => {
      await tx.execute(sql.raw(`set local role ${quoteIdentifier(runtimeRole)}`));
      await tx.execute(sql`set local row_security = on`);
      await tx.execute(sql`select set_config('app.current_access_tenant_id', ${tenantId}, true),
      set_config('app.current_tenant_id', ${tenantId}, true),
      set_config('app.user_role', ${role}, true)`);
      return work(tx);
    },
    { isolationLevel }
  );
}

export function withExchangeRateFixture(run: (fixture: ExchangeRateFixture) => Promise<void>) {
  return withPaymentPortDatabase(async ({ admin, peer }) => {
    await run({ ...(await createFixture(admin)), peer });
  });
}

async function createFixture(admin: postgres.Sql) {
  const tenants = Array.from({ length: 4 }, () => `wp07_${randomUUID()}`);
  const [tenantId, otherTenant, noEntity, concurrentTenant] = tenants;
  await admin`insert into tenants (id, name, legal_name, country_code)
    select id, id, id, 'MK' from unnest(${tenants}::text[]) as id`;
  const actor = { id: randomUUID(), tenantId };
  const withoutBook = { id: randomUUID(), tenantId: noEntity };
  for (const user of [actor, withoutBook]) {
    await admin`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      values (${user.id}, ${user.tenantId}, 'Test administrator', ${`${user.id}@example.test`}, true, 'tenant_admin', now(), now())`;
  }

  const session = (roleName = 'tenant_admin', home = tenantId, access = home, userId = actor.id) =>
    paymentPortTestSession(home, userId, roleName, null, access);
  const authority = session();
  const bookRows = (id: string) =>
    restricted(
      admin,
      id,
      tx =>
        tx<
          { id: string; base: string; quote: string }[]
        >`select id, base, quote from exchange_rate_books`
    );
  const createEntity = (client: postgres.Sql | postgres.TransactionSql, id: string) =>
    client`insert into legal_entities (id, tenant_id, legal_name, country_code)
      values (${randomUUID()}, ${id}, 'Test entity', 'MK')`;
  return {
    admin,
    tenantId,
    otherTenant,
    noEntity,
    concurrentTenant,
    actor,
    withoutBook,
    session,
    authority,
    bookRows,
    createEntity,
  };
}
