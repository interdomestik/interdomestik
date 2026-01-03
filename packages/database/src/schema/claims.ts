import { boolean, decimal, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { documentCategoryEnum, statusEnum } from './enums';
import { branches } from './rbac';
import { tenants } from './tenants';

export const claims = pgTable(
  'claim',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id)
      .default('tenant_mk'),
    userId: text('userId')
      .notNull()
      .references(() => user.id),
    agentId: text('agent_id').references(() => user.id), // Sales agent from membership
    branchId: text('branch_id').references(() => branches.id), // Branch scoping from membership
    staffId: text('staffId').references(() => user.id), // Assigned staff handler
    assignedAt: timestamp('assignedAt'),
    assignedById: text('assignedById').references(() => user.id),
    title: text('title').notNull(),
    description: text('description'),
    status: statusEnum('status').default('draft'),
    category: text('category').notNull(), // e.g. 'retail', 'services'
    companyName: text('companyName').notNull(),
    claimAmount: decimal('amount', { precision: 10, scale: 2 }),
    currency: text('currency').default('EUR'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
  },
  table => ({
    branchIdx: index('idx_claims_branch').on(table.branchId),
    agentIdx: index('idx_claims_agent').on(table.agentId),
  })
);

export const claimDocuments = pgTable('claim_documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .default('tenant_mk'),
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
});

export const claimMessages = pgTable('claim_messages', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .default('tenant_mk'),
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
    .references(() => tenants.id)
    .default('tenant_mk'),
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
