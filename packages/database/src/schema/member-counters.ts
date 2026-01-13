import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core';

export const memberCounters = pgTable('member_counters', {
  year: integer('year').primaryKey(), // The year (e.g., 2026)
  lastNumber: integer('last_number').default(0).notNull(), // The last assigned number
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date()),
});
