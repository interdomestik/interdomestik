import assert from 'node:assert/strict';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

/**
 * Applies the journal up to, not including, WP-11's notification migration. That migration requires
 * the runtime role's row-lock privileges on claim tables; a fixture that creates the role with
 * narrower privileges stops before it. WP-11's own fixture proves those prerequisites.
 */
export async function migrateJournalBeforeNotificationDeliveries(
  admin: postgres.Sql,
  migrationsFolder: string
) {
  const config = { migrationsFolder };
  const journal = readMigrationFiles(config);
  const wp11 = journal.findIndex(migration =>
    migration.sql.some(statement => statement.includes('CREATE TABLE "notification_deliveries"'))
  );
  assert.ok(wp11 > 0, 'the WP-11 notification migration is journaled');
  const adminDb = drizzle(admin, { schema: {} });
  await new PgDialect().migrate(journal.slice(0, wp11), adminDb._.session, config);
}
