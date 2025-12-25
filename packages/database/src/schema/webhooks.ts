import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
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
});
