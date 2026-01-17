/**
 * Documents Schema - M3.1
 *
 * Polymorphic document storage with entityType/entityId pattern.
 * All documents are tenant-scoped for isolation.
 */
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { tenants } from './tenants';

// Entity types for polymorphic document association
export const documentEntityTypeEnum = pgEnum('document_entity_type', [
  'claim',
  'member',
  'thread',
  'share_pack',
  'payment_attempt',
]);

// Document storage category
export const documentStorageCategoryEnum = pgEnum('document_storage_category', [
  'evidence',
  'correspondence',
  'contract',
  'receipt',
  'identity',
  'medical',
  'legal',
  'export',
  'other',
]);

export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),

    // Polymorphic association
    entityType: documentEntityTypeEnum('entity_type').notNull(),
    entityId: text('entity_id').notNull(),

    // File metadata
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(), // bytes
    storagePath: text('storage_path').notNull(), // Full path in object storage

    // Classification
    category: documentStorageCategoryEnum('category').default('other'),
    description: text('description'),

    // Audit fields
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => user.id),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),

    // Soft delete support
    deletedAt: timestamp('deleted_at'),
    deletedBy: text('deleted_by').references(() => user.id),
  },
  table => [
    // Tenant isolation index
    index('idx_documents_tenant').on(table.tenantId),
    // Polymorphic lookup
    index('idx_documents_entity').on(table.entityType, table.entityId),
    // Combined for efficient queries
    index('idx_documents_tenant_entity').on(table.tenantId, table.entityType, table.entityId),
    // Storage path uniqueness
    uniqueIndex('idx_documents_storage_path').on(table.storagePath),
  ]
);

// Document access audit log - immutable append-only
export const documentAccessLog = pgTable(
  'document_access_log',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id),

    // Access details
    accessType: text('access_type').notNull(), // 'view' | 'download' | 'share' | 'delete'
    accessedBy: text('accessed_by').references(() => user.id), // nullable for anonymous share access
    accessedAt: timestamp('accessed_at').defaultNow().notNull(),

    // Context
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    shareToken: text('share_token'), // If accessed via share link
  },
  table => [
    index('idx_document_access_log_tenant').on(table.tenantId),
    index('idx_document_access_log_document').on(table.documentId),
    index('idx_document_access_log_time').on(table.accessedAt),
  ]
);

// M3.3.1 Share Packs - Server-side state for shared bundles
export const sharePacks = pgTable(
  'share_packs',
  {
    id: text('id').primaryKey(), // packId
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),

    // Creator context
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),

    // Optional entity context (what is being shared?)
    entityType: text('entity_type'), // e.g. 'claim'
    entityId: text('entity_id'),

    // Content: Array of document IDs
    documentIds: text('document_ids').array().notNull(), // PostgreSQL array of text is cleaner than jsonb for simple string lists

    // Lifecycle
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    revokedByUserId: text('revoked_by_user_id').references(() => user.id),
  },
  table => [
    index('idx_share_packs_tenant').on(table.tenantId),
    index('idx_share_packs_entity').on(table.entityType, table.entityId),
    // Token lookup is usually by ID, so PK index covers it.
    // Tenant scoping check is ID + TenantID.
  ]
);

// Type exports for use in domain layer
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentAccessLog = typeof documentAccessLog.$inferSelect;
export type NewDocumentAccessLog = typeof documentAccessLog.$inferInsert;
export type SharePack = typeof sharePacks.$inferSelect;
export type NewSharePack = typeof sharePacks.$inferInsert;
