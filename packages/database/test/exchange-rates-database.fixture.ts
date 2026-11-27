import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

import { withDisposableClient } from '../src/disposable-client';
import { runtimeRole } from './exchange-rates-restricted.fixture';
import {
  migrateJournalBeforeNotificationDeliveries,
  migrateJournalThrough,
} from './journal-prefix.support';
import { migrateJournal, withScratchDatabase } from './pg16/scratch-database';
import {
  applyRlsTestConnectionEnv,
  quoteIdentifier,
  quoteSqlLiteral,
  TEST_DB_ROLE,
} from './rls-test-connection';
import { grantRlsTestRole } from './rls-test-grants';
import { provisionRestrictedRole } from './s8-claim-restricted-rls.fixture';
import { grantNotificationDeliveryRowLocks } from './wp11-notification-deliveries-rls.fixture';

export const tables = ['exchange_rate_books', 'exchange_rates'] as const;
const migrations = fileURLToPath(new URL('../drizzle', import.meta.url));

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
export type RateMigrationPhase = '0104' | 'expand' | 'contract';

export async function migratePaymentPortPhase(admin: postgres.Sql, phase: RateMigrationPhase) {
  if (phase === '0104') {
    return migrateJournalThrough(admin, migrations, '0104_wp07_rate_verification_age');
  }
  await migrateJournalBeforeNotificationDeliveries(admin, migrations);
  await grantNotificationDeliveryRowLocks(admin);
  if (phase === 'expand') {
    return migrateJournalThrough(admin, migrations, { name: 'wp07_rate_check_expand' });
  }
  return migrateJournal(admin, migrations);
}

export function requirePaymentPortTestRunner() {
  if (!process.env.NODE_TEST_CONTEXT && process.env.VITEST !== 'true') {
    throw new Error('Payment port fixtures require a test runner');
  }
}

export async function withPaymentPortDatabase(
  run: (fixture: PaymentPortDatabase) => Promise<void>,
  phase: RateMigrationPhase = 'contract'
) {
  requirePaymentPortTestRunner();
  // The scratch database owns all append-only rows and disappears after the proof.
  await withScratchDatabase('wp07_payment', admin =>
    withRuntimeLogin(admin, async (username, password) => {
      // The billing migrations grant privileges to the runtime role when it exists.
      await migratePaymentPortPhase(admin, phase);
      const [{ name }] = await admin<{ name: string }[]>`select current_database() as name`;
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = `/${name}`;

      const adminDb = drizzle(admin);
      await provisionRestrictedRole(adminDb);
      await grantRlsTestRole(adminDb, tables);
      // The append-only tests need permission on the rate tables and their CASCADE dependents.
      await admin.unsafe(
        `grant update, delete, truncate on exchange_rate_books, exchange_rates to ${quoteIdentifier(TEST_DB_ROLE)}`
      );
      await admin.unsafe(
        `grant truncate on public.membership_sales, public.membership_ledger_entries, public.exchange_rate_verifications to ${quoteIdentifier(TEST_DB_ROLE)}`
      );
      if (phase !== '0104') {
        await admin.unsafe(
          `grant truncate on public.exchange_rate_check_events, public.exchange_rate_check_windows to ${quoteIdentifier(TEST_DB_ROLE)}`
        );
      }
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
