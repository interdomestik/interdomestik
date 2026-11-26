import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import { PgDialect, type PgSession } from 'drizzle-orm/pg-core';
import { inspectMigrationLedgerCatalog } from './migration-ledger-catalog';
import type { LedgerRow } from './migration-ledger-contracts';
import type { ReleaseSql } from './release-sponsor-checkpoint';

export function readReleaseJournal(migrationsFolder: string) {
  const { entries }: { entries: { tag: string; when: number }[] } = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  );
  const migrations = readMigrationFiles({ migrationsFolder });
  const journal = migrations.map((migration, index) => ({ ...migration, tag: entries[index].tag }));
  let maximum = 0;
  for (const [index, entry] of journal.entries()) {
    if (
      !Number.isSafeInteger(entry.folderMillis) ||
      (entry.folderMillis <= maximum &&
        !(
          index === 14 &&
          entry.tag === '0014_webhook_events_tenant_nullable' &&
          entry.folderMillis === 1767469552201 &&
          journal[13].tag === '0013_add_agent_clients_unique' &&
          maximum === 1767890798000
        ))
    ) {
      throw new Error(`Unexpected journal timestamp at ${entry.tag}`);
    }
    maximum = Math.max(maximum, entry.folderMillis);
  }
  return journal;
}

export async function verifiedReleaseLedger(sql: ReleaseSql, journal: readonly MigrationMeta[]) {
  const catalog = await inspectMigrationLedgerCatalog(sql);
  if (catalog === 'table_absent') throw new Error('Incomplete Drizzle ledger catalog');
  // Preserve integer key order when returning text IDs for evidence.
  const rows =
    catalog === 'table_present'
      ? await sql<LedgerRow[]>`
    select ledger.id::text, ledger.hash, ledger.created_at::text
    from drizzle.__drizzle_migrations as ledger order by ledger.id limit ${journal.length + 1}
  `
      : [];
  for (const [index, row] of rows.entries()) {
    const expected = journal[index];
    if (
      !expected ||
      row.hash !== expected.hash ||
      row.created_at !== String(expected.folderMillis)
    ) {
      throw new Error(`Drizzle ledger differs from the journal at position ${index}`);
    }
  }
  return [...rows];
}

export async function applyReleaseJournal(
  session: PgSession,
  migrationsFolder: string,
  migrations: MigrationMeta[]
) {
  // Use Drizzle's original migration bodies, transaction machinery and ledger.
  await new PgDialect().migrate(migrations, session, { migrationsFolder });
}

/** postgres.js reserve() exposes a pinned query handle without the driver's begin or options. */
export function releaseConnection(
  reserved: ReleaseSql,
  options: ReleaseSql['options']
): ReleaseSql {
  return Object.assign(reserved, {
    options,
    begin: <T>(work: (tx: ReleaseSql) => Promise<T>) => inReleaseTransaction(reserved, work),
  });
}

export async function inReleaseTransaction<T>(
  sql: ReleaseSql,
  work: (tx: ReleaseSql) => Promise<T>
): Promise<T> {
  await sql.unsafe('BEGIN');
  let committed = false;
  return withReleaseCleanup(
    async () => {
      const result = await work(sql);
      await sql.unsafe('COMMIT');
      committed = true;
      return result;
    },
    async () => {
      if (!committed) await sql.unsafe('ROLLBACK');
    },
    'Release migration and transaction rollback both failed'
  );
}

export async function withReleaseCleanup<T>(
  work: () => Promise<T>,
  cleanup: () => Promise<void>,
  message: string
): Promise<T> {
  let result: T;
  try {
    result = await work();
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], message);
    }
    throw error;
  }
  await cleanup();
  return result;
}
