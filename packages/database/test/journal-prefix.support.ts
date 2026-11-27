import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMigrationFiles, type MigrationMeta } from 'drizzle-orm/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

type JournalBoundary = string | { name: string };

function readJournalThrough(migrationsFolder: string, boundary: JournalBoundary) {
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
  );
  const matches = ({ tag }: { tag: string }) =>
    typeof boundary === 'string' ? tag === boundary : tag.replace(/^\d{4}_/u, '') === boundary.name;
  const label = typeof boundary === 'string' ? boundary : boundary.name;
  const index = journal.entries.findIndex(matches);
  assert.ok(index >= 0, `migration ${label} is journaled`);
  assert.ok(!journal.entries.slice(index + 1).some(matches), `migration ${label} is unambiguous`);
  return readMigrationFiles({ migrationsFolder }).slice(0, index + 1);
}

function applyJournal(admin: postgres.Sql, migrationsFolder: string, migrations: MigrationMeta[]) {
  const adminDb = drizzle(admin, { schema: {} });
  return new PgDialect().migrate(migrations, adminDb._.session, { migrationsFolder });
}

export function migrateJournalThrough(
  admin: postgres.Sql,
  migrationsFolder: string,
  boundary: JournalBoundary
) {
  return applyJournal(admin, migrationsFolder, readJournalThrough(migrationsFolder, boundary));
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
