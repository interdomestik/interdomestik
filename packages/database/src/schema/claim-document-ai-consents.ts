import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { claimDocuments, claims } from './claims';
import { tenants } from './tenants';

export const claimDocumentAiExtractionConsents = pgTable(
  'claim_document_ai_extraction_consents',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    subjectId: text('subject_id')
      .notNull()
      .references(() => user.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),
    documentId: text('document_id')
      .notNull()
      .references(() => claimDocuments.id),
    consentType: text('consent_type').notNull(),
    processingPurpose: text('processing_purpose').notNull(),
    status: text('status').notNull(),
    privacyVersion: text('privacy_version').notNull(),
    locale: text('locale').notNull(),
    sourceSurface: text('source_surface').notNull(),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
    grantedAt: timestamp('granted_at'),
    withdrawnAt: timestamp('withdrawn_at'),
    supersedesConsentId: text('supersedes_consent_id'),
  },
  table => [
    index('idx_claim_doc_ai_consents_scope').on(
      table.tenantId,
      table.subjectId,
      table.claimId,
      table.documentId,
      table.processingPurpose,
      table.recordedAt
    ),
    check('claim_doc_ai_consent_type_check', sql`${table.consentType} = 'ai_document_extraction'`),
    check(
      'claim_doc_ai_processing_purpose_check',
      sql`${table.processingPurpose} = 'ai_document_extraction'`
    ),
    check('claim_doc_ai_consent_status_check', sql`${table.status} in ('accepted', 'withdrawn')`),
  ]
);

export type ClaimDocumentAiExtractionConsent =
  typeof claimDocumentAiExtractionConsents.$inferSelect;
export type NewClaimDocumentAiExtractionConsent =
  typeof claimDocumentAiExtractionConsents.$inferInsert;
