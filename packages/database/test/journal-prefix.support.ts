import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

function readJournalThrough(migrationsFolder: string, tag: string) {
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  );
  const index = journal.entries.findIndex(entry => entry.tag === tag);
  assert.ok(index >= 0, `migration ${tag} is journaled`);
  return readMigrationFiles({ migrationsFolder }).slice(0, index + 1);
}

function applyJournal(admin: postgres.Sql, migrationsFolder: string, migrations: MigrationMeta[]) {
  const adminDb = drizzle(admin, { schema: {} });
  return new PgDialect().migrate(migrations, adminDb._.session, { migrationsFolder });
}

export function migrateJournalThrough(admin: postgres.Sql, migrationsFolder: string, tag: string) {
  return applyJournal(admin, migrationsFolder, readJournalThrough(migrationsFolder, tag));
}

/**
 * Applies the predecessors of WP-11's notification migration and returns the migration for tests
 * that exercise it separately. Scratch fixtures can grant its row-lock prerequisites at this point.
 */
export async function migrateJournalBeforeNotificationDeliveries(
  admin: postgres.Sql,
  migrationsFolder: string
) {
  const journal = readJournalThrough(migrationsFolder, '0105_wp11_notification_deliveries');
  assert.ok(journal.length > 1, 'the WP-11 notification migration has journaled predecessors');
  await applyJournal(admin, migrationsFolder, journal.slice(0, -1));
  return journal.at(-1);
}
