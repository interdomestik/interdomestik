import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const claimCounters = pgTable(
  'claim_counters',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    year: integer('year').notNull(),
    lastNumber: integer('last_number').default(0).notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [primaryKey({ columns: [table.tenantId, table.year] })]
);
