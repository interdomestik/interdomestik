import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

export const domainEvents = pgTable(
  'domain_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accessTenantId: text('access_tenant_id').references(() => tenants.id),
    actorId: text('actor_id').notNull(),
    actorRole: text('actor_role').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    eventName: text('event_name').notNull(),
    eventVersion: integer('event_version').notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('domain_events_tenant_id_id_uq').on(table.tenantId, table.id),
    index('domain_events_access_tenant_idx').on(table.accessTenantId),
    index('domain_events_tenant_created_idx').on(table.tenantId, table.createdAt),
    index('domain_events_entity_idx').on(table.entityType, table.entityId, table.aggregateVersion),
    index('domain_events_correlation_idx').on(table.correlationId),
    check('domain_events_event_version_check', sql`${table.eventVersion} >= 1`),
    check('domain_events_aggregate_version_check', sql`${table.aggregateVersion} >= 0`),
  ]
);
