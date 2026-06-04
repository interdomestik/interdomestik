import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { domainEvents } from './domain-events';
import { tenants } from './tenants';

export const domainEventDeliveries = pgTable(
  'domain_event_deliveries',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    consumerName: text('consumer_name').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('domain_event_deliveries_event_consumer_uq').on(table.eventId, table.consumerName),
    uniqueIndex('domain_event_deliveries_idempotency_key_uq').on(table.idempotencyKey),
    index('domain_event_deliveries_tenant_consumer_idx').on(
      table.tenantId,
      table.consumerName,
      table.deliveredAt
    ),
    foreignKey({
      columns: [table.tenantId, table.eventId],
      foreignColumns: [domainEvents.tenantId, domainEvents.id],
      name: 'domain_event_deliveries_tenant_event_fk',
    }),
    check(
      'domain_event_deliveries_consumer_name_check',
      sql`length(trim(${table.consumerName})) > 0`
    ),
    check(
      'domain_event_deliveries_idempotency_key_check',
      sql`length(trim(${table.idempotencyKey})) > 0`
    ),
  ]
);
