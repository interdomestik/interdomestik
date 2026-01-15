/**
 * Seed Meta Schema - Tracks seed runs for version control
 *
 * This table stores one row per seed run, enabling:
 * - Version-based auto-reset for E2E
 * - Destructive operation protection for golden/full/workload
 */
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const seedMeta = pgTable(
  'seed_meta',
  {
    id: integer('id').primaryKey().notNull().default(1), // Singleton row
    version: text('version').notNull(), // Semantic version or hash
    mode: text('mode').notNull(), // 'e2e' | 'golden' | 'full' | 'workload'
    gitSha: text('git_sha'), // Git commit SHA if available
    seedBaseTime: timestamp('seed_base_time').notNull(), // Deterministic base time for seeding
    runAt: timestamp('run_at').defaultNow().notNull(),
    runBy: text('run_by'), // CI job ID or 'local'
  },
  table => ({
    singletonEnforcement: check('seed_meta_singleton', sql`${table.id} = 1`),
  })
);

export type SeedMeta = typeof seedMeta.$inferSelect;
export type NewSeedMeta = typeof seedMeta.$inferInsert;
