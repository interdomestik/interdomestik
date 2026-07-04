import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { claims } from './claim-core';
import { documentCategoryEnum, statusEnum } from './enums';
import { tenants } from './tenants';

export const claimDocuments = pgTable(
  'claim_documents',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accessTenantId: text('access_tenant_id').references(() => tenants.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),
    name: text('name').notNull(),
    filePath: text('file_path').notNull(),
    fileType: text('file_type').notNull(),
    fileSize: integer('file_size').notNull(),
    bucket: text('bucket').notNull().default('claim-evidence'),
    classification: text('classification').notNull().default('pii'),
    category: documentCategoryEnum('category').default('evidence').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at').defaultNow(),
  },
  table => [index('claim_documents_access_tenant_idx').on(table.accessTenantId)]
);

export const claimMessages = pgTable('claim_messages', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  claimId: text('claim_id')
    .notNull()
    .references(() => claims.id),
  senderId: text('sender_id')
    .notNull()
    .references(() => user.id),
  content: text('content').notNull(),
  isInternal: boolean('is_internal').default(false),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const claimStageHistory = pgTable('claim_stage_history', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  claimId: text('claim_id')
    .notNull()
    .references(() => claims.id),
  fromStatus: statusEnum('from_status'),
  toStatus: statusEnum('to_status').notNull(),
  changedById: text('changed_by_id').references(() => user.id),
  changedByRole: text('changed_by_role'),
  note: text('note'),
  isPublic: boolean('is_public').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
