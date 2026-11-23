import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const legalDocumentVersions = pgTable(
  'legal_document_versions',
  {
    kind: text('kind').notNull(),
    version: text('version').notNull(),
    locale: text('locale').notNull(),
    textSha256: text('text_sha256').notNull(),
    reviewStatus: text('review_status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  table => [
    unique('legal_document_versions_digest_uq').on(
      table.kind,
      table.version,
      table.locale,
      table.textSha256
    ),
    check('legal_document_versions_kind_check', sql`${table.kind} in ('terms', 'privacy_notice')`),
    check(
      'legal_document_versions_locale_check',
      sql`${table.locale} in ('sq', 'en', 'sr', 'mk', 'de')`
    ),
    check('legal_document_versions_digest_check', sql`${table.textSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      'legal_document_versions_review_status_check',
      sql`${table.reviewStatus} in ('legal_review_pending', 'approved')`
    ),
  ]
);
