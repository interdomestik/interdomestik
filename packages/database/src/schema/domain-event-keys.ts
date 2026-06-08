import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

export const domainEventKeys = pgTable(
  'domain_event_keys',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    erasedAt: timestamp('erased_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('domain_event_keys_tenant_subject_uq').on(
      table.tenantId,
      table.subjectType,
      table.subjectId
    ),
    index('domain_event_keys_tenant_erased_idx').on(table.tenantId, table.erasedAt),
    check('domain_event_keys_subject_type_check', sql`length(trim(${table.subjectType})) > 0`),
    check('domain_event_keys_subject_id_check', sql`length(trim(${table.subjectId})) > 0`),
  ]
);
