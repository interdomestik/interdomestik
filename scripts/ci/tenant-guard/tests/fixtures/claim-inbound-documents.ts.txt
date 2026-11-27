import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { claims } from './claim-core';
import { claimCorrespondence } from './claim-correspondence';

export const claimInboundPilotCases = pgTable(
  'claim_inbound_pilot_cases',
  {
    tenantId: text('tenant_id').notNull(),
    claimId: text('claim_id').primaryKey(),
    paused: boolean('paused').default(false).notNull(),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true, precision: 3 }),
    legacyCredentialDisposition: text('legacy_credential_disposition'),
  },
  t => [
    foreignKey({
      name: 'claim_inbound_pilot_cases_claim_fk',
      columns: [t.tenantId, t.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    check(
      'claim_inbound_pilot_cases_disposition_check',
      sql`(${t.legacyCredentialDisposition} is null and ${t.enrolledAt} is null)
        or (${t.legacyCredentialDisposition} is not null
          and ${t.legacyCredentialDisposition} in ('expired', 'invalidated', 'none-issued'))`
    ),
    pgPolicy('claim_inbound_pilot_cases_read', {
      for: 'select',
      using: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        or exists (select 1 from "claim" c where c.tenant_id = ${t.tenantId} and c.id = ${t.claimId}
          and coalesce(c.access_tenant_id, c.tenant_id) = (select current_setting('app.current_access_tenant_id', true))::text)`,
    }),
  ]
).enableRLS();

export const claimInboundUploadDecisions = pgTable(
  'claim_inbound_upload_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id').notNull(),
    claimId: text('claim_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    classification: text('classification').notNull(),
    decidedBy: text('decided_by').notNull(),
    roleBasis: text('role_basis').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    recipientId: text('recipient_id').notNull(),
    uploaderId: text('uploader_id').notNull(),
    officeReceiptRef: varchar('office_receipt_ref', { length: 128 }).notNull(),
    documentId: text('document_id').notNull(),
    bucket: varchar('bucket', { length: 128 }).notNull(),
    filePath: varchar('file_path', { length: 768 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
  },
  t => [
    uniqueIndex('claim_inbound_decisions_correlation_uq').on(t.tenantId, t.correlationId),
    uniqueIndex('claim_inbound_decisions_document_uq').on(t.documentId),
    uniqueIndex('claim_inbound_decisions_object_uq').on(t.bucket, t.filePath),
    index('claim_inbound_decisions_case_idx').on(t.tenantId, t.claimId),
    foreignKey({
      name: 'claim_inbound_decisions_claim_fk',
      columns: [t.tenantId, t.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_inbound_decisions_actor_fk',
      columns: [t.tenantId, t.decidedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'claim_inbound_decisions_basis_check',
      sql`(${t.classification} = 'intended-for-member' and ${t.roleBasis} = 'staff')
        or (${t.classification} = 'approved-to-show' and ${t.roleBasis} = 'tenant_admin')`
    ),
    check(
      'claim_inbound_decisions_file_check',
      sql`${t.fileSize} between 1 and 1048576 and ${t.mimeType} = 'application/pdf'
        and ${t.sha256} ~ '^[a-f0-9]{64}$' and ${t.fileName} ~ '\\S'
        and ${t.officeReceiptRef} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'`
    ),
    check(
      'claim_inbound_decisions_key_check',
      sql`${t.documentId} ~ '^wp12-inbound-[a-f0-9]{32}$'
        and ${t.filePath} = 'pii/tenants/' || ${t.tenantId} || '/claims/' || ${t.claimId} || '/' || ${t.documentId} || '.pdf'`
    ),
    pgPolicy('claim_inbound_decisions_tenant', {
      for: 'all',
      using: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
    }),
  ]
).enableRLS();

export const claimInboundObjectVerifications = pgTable(
  'claim_inbound_object_verifications',
  {
    decisionId: uuid('decision_id').primaryKey(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  t => [
    foreignKey({
      name: 'claim_inbound_object_verifications_decision_fk',
      columns: [t.decisionId],
      foreignColumns: [claimInboundUploadDecisions.id],
    }),
    // The migration adds the verification writer's policy after creating its role.
    pgPolicy('claim_inbound_object_verifications_read', {
      for: 'select',
      using: sql`exists (select 1 from public.claim_inbound_upload_decisions as d where d.id = ${t.decisionId})`,
    }),
  ]
).enableRLS();

export const claimCorrespondenceReceivedSeals = pgTable(
  'claim_correspondence_received_seals',
  {
    tenantId: text('tenant_id').notNull(),
    claimId: text('claim_id').notNull(),
    correspondenceId: uuid('correspondence_id').primaryKey(),
    documentCount: integer('document_count').notNull(),
  },
  t => [
    check('claim_received_seals_count_check', sql`${t.documentCount} between 0 and 20`),
    foreignKey({
      name: 'claim_received_seals_claim_fk',
      columns: [t.tenantId, t.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    pgPolicy('claim_received_seals_tenant', {
      for: 'all',
      using: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
    }),
  ]
).enableRLS();

export const claimCorrespondenceReceivedDocuments = pgTable(
  'claim_correspondence_received_documents',
  {
    tenantId: text('tenant_id').notNull(),
    claimId: text('claim_id').notNull(),
    correspondenceId: uuid('correspondence_id').notNull(),
    claimDocumentId: text('claim_document_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
  },
  t => [
    uniqueIndex('claim_received_documents_entry_document_uq').on(
      t.correspondenceId,
      t.claimDocumentId
    ),
    index('claim_received_documents_case_idx').on(t.tenantId, t.claimId, t.correspondenceId),
    index('claim_received_documents_document_idx').on(t.tenantId, t.claimId, t.claimDocumentId),
    foreignKey({
      name: 'claim_received_documents_entry_fk',
      columns: [t.tenantId, t.claimId, t.correspondenceId],
      foreignColumns: [
        claimCorrespondence.tenantId,
        claimCorrespondence.claimId,
        claimCorrespondence.id,
      ],
    }),
    // Migration 0114 manages the document foreign key with immediate RESTRICT.
    pgPolicy('claim_received_documents_tenant', {
      for: 'all',
      using: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${t.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${t.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
    }),
  ]
).enableRLS();
