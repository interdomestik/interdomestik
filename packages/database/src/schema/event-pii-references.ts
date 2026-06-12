import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { domainEvents } from './domain-events';
import { tenants } from './tenants';

export const eventPiiReferences = pgTable(
  'event_pii_references',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventId: text('event_id').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    referenceKind: text('reference_kind').notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('event_pii_references_tenant_id_id_uq').on(table.tenantId, table.id),
    index('event_pii_references_tenant_event_idx').on(table.tenantId, table.eventId),
    index('event_pii_references_tenant_subject_idx').on(
      table.tenantId,
      table.subjectType,
      table.subjectId
    ),
    foreignKey({
      columns: [table.tenantId, table.eventId],
      foreignColumns: [domainEvents.tenantId, domainEvents.id],
      name: 'event_pii_references_tenant_event_fk',
    }),
    check('event_pii_references_subject_type_check', sql`length(trim(${table.subjectType})) > 0`),
    check('event_pii_references_subject_id_check', sql`length(trim(${table.subjectId})) > 0`),
    check('event_pii_references_kind_check', sql`length(trim(${table.referenceKind})) > 0`),
    check('event_pii_references_payload_check', sql`length(trim(${table.encryptedPayload})) > 0`),
  ]
);

export const eventPiiKeys = pgTable(
  'event_pii_keys',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    referenceId: text('reference_id').notNull(),
    keyCiphertext: text('key_ciphertext').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    destroyedAt: timestamp('destroyed_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('event_pii_keys_tenant_reference_uq').on(table.tenantId, table.referenceId),
    index('event_pii_keys_tenant_destroyed_idx').on(table.tenantId, table.destroyedAt),
    foreignKey({
      columns: [table.tenantId, table.referenceId],
      foreignColumns: [eventPiiReferences.tenantId, eventPiiReferences.id],
      name: 'event_pii_keys_tenant_reference_fk',
    }),
    check('event_pii_keys_ciphertext_check', sql`length(trim(${table.keyCiphertext})) > 0`),
    check('event_pii_keys_version_check', sql`${table.keyVersion} >= 1`),
  ]
);
