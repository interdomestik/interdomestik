import { boolean, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { noteTypeEnum } from './enums';

// Member Interaction Logging
export const memberNotes = pgTable('member_notes', {
  id: text('id').primaryKey(),
  memberId: text('member_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  authorId: text('author_id')
    .notNull()
    .references(() => user.id),
  type: noteTypeEnum('type').default('general').notNull(),
  content: text('content').notNull(),
  isPinned: boolean('is_pinned').default(false).notNull(),
  isInternal: boolean('is_internal').default(true).notNull(),
  followUpDate: timestamp('follow_up_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
});

// Audit logging for compliance
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => user.id),
  actorRole: text('actor_role'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow(),
});
