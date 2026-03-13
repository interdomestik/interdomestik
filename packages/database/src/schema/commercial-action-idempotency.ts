import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { tenants } from './tenants';

export const commercialActionIdempotency = pgTable(
  'commercial_action_idempotency',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').references(() => tenants.id),
    actorUserId: text('actor_user_id').references(() => user.id),
    action: text('action').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprintHash: text('request_fingerprint_hash').notNull(),
    responsePayload: jsonb('response_payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('commercial_action_idempotency_action_key_uq').on(
      table.action,
      table.idempotencyKey
    ),
    index('commercial_action_idempotency_tenant_idx').on(table.tenantId),
    index('commercial_action_idempotency_actor_idx').on(table.actorUserId),
  ]
);
