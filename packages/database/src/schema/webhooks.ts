import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').references(() => tenants.id),
    provider: text('provider').notNull(),
    processingScopeKey: text('processing_scope_key').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    eventType: text('event_type'),
    eventId: text('event_id'),
    providerTransactionId: text('provider_transaction_id'),
    signatureValid: boolean('signature_valid').notNull().default(false),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    eventTimestamp: timestamp('event_timestamp', { withTimezone: true }),
    payloadHash: text('payload_hash').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingResult: text('processing_result'),
    error: text('error'),
  },
  table => [
    uniqueIndex('webhook_events_dedupe_key_uq').on(table.dedupeKey),
    uniqueIndex('webhook_events_provider_scope_event_id_uq')
      .on(table.provider, table.processingScopeKey, table.eventId)
      .where(sql`${table.eventId} is not null`),
    uniqueIndex('webhook_events_provider_scope_transaction_id_uq')
      .on(table.provider, table.processingScopeKey, table.providerTransactionId)
      .where(sql`${table.providerTransactionId} is not null`),
    index('webhook_events_received_at_idx').on(table.receivedAt),
    index('webhook_events_processing_scope_key_idx').on(table.processingScopeKey),
  ]
);
