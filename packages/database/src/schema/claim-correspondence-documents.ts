import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { claimCorrespondence } from './claim-correspondence';
import { claims } from './claim-core';
import { tenants } from './tenants';

// Closed tail grammar (tenant guard): fresh tables only, no helpers, no `$type`.
// Value sets are database checks; the domain parses them at its read sites.

export const claimCorrespondenceDocuments = pgTable(
  'claim_correspondence_documents',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id').notNull(),
    correspondenceId: uuid('correspondence_id').notNull(),
    claimDocumentId: text('claim_document_id').notNull(),
    documentBucket: text('document_bucket').notNull(),
    documentFilePath: text('document_file_path').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  table => [
    index('claim_correspondence_documents_entry_idx').on(
      table.tenantId,
      table.claimId,
      table.correspondenceId
    ),
    index('claim_correspondence_documents_document_idx').on(
      table.tenantId,
      table.claimId,
      table.claimDocumentId
    ),
    uniqueIndex('claim_correspondence_documents_entry_uq').on(
      table.correspondenceId,
      table.claimDocumentId
    ),
    foreignKey({
      name: 'claim_correspondence_documents_claim_fk',
      columns: [table.tenantId, table.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_correspondence_documents_correspondence_fk',
      columns: [table.tenantId, table.claimId, table.correspondenceId],
      foreignColumns: [
        claimCorrespondence.tenantId,
        claimCorrespondence.claimId,
        claimCorrespondence.id,
      ],
    }),
    pgPolicy('claim_correspondence_documents_tenant_policy', {
      for: 'all',
      using: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${table.claimId} and c.tenant_id = ${table.tenantId})`,
    }),
  ]
).enableRLS();

export const claimCaseFields = pgTable(
  'claim_case_fields',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id').notNull(),
    otherVehicleCountryCode: text('other_vehicle_country_code'),
    insuranceProofReference: varchar('insurance_proof_reference', { length: 200 }),
    outsideHandlingParty: varchar('outside_handling_party', { length: 200 }),
    coverageVerificationStatus: text('coverage_verification_status')
      .notNull()
      .default('not_checked'),
    caseFollowUpAt: timestamp('case_follow_up_at', { withTimezone: true, precision: 3 }),
    updatedByStaffId: text('updated_by_staff_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('claim_case_fields_claim_uq').on(table.tenantId, table.claimId),
    index('claim_case_fields_follow_up_idx').on(table.tenantId, table.caseFollowUpAt),
    foreignKey({
      name: 'claim_case_fields_updated_by_fk',
      columns: [table.tenantId, table.updatedByStaffId],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'claim_case_fields_country_check',
      sql`${table.otherVehicleCountryCode} is null or ${table.otherVehicleCountryCode} ~ '^[A-Z]{2}$'`
    ),
    check(
      'claim_case_fields_insurance_reference_check',
      sql`${table.insuranceProofReference} is null or ${table.insuranceProofReference} ~ '\\S'`
    ),
    check(
      'claim_case_fields_coverage_check',
      sql`${table.coverageVerificationStatus} in ('not_checked', 'requested', 'confirmed_by_party', 'refused_by_party')`
    ),
    // A side row is never visible without its claim: the claim's own policy filters the subquery.
    pgPolicy('claim_case_fields_tenant_policy', {
      for: 'all',
      using: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${table.claimId} and c.tenant_id = ${table.tenantId})`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text
        and ${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = ${table.claimId} and c.tenant_id = ${table.tenantId})`,
    }),
  ]
).enableRLS();
