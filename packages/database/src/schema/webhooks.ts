import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id)
      .default('tenant_mk'),
    provider: text('provider').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    eventType: text('event_type'),
    eventId: text('event_id'),
    signatureValid: boolean('signature_valid').notNull().default(false),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    eventTimestamp: timestamp('event_timestamp', { withTimezone: true }),
    payloadHash: text('payload_hash').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingResult: text('processing_result'),
    error: text('error'),
  },
  table => ({
    dedupeKeyUq: uniqueIndex('webhook_events_dedupe_key_uq').on(table.dedupeKey),
    providerEventIdUq: uniqueIndex('webhook_events_provider_event_id_uq').on(
      table.provider,
      table.eventId
    ),
    receivedAtIdx: index('webhook_events_received_at_idx').on(table.receivedAt),
  })
);
