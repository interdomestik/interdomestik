import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { claimDocuments, claims } from './claims';
import { tenants } from './tenants';

export const claimTransitionEvidenceTypes = [
  'assignment_signed',
  'poa_signed',
  'airline_submission_consent',
  'vehicle_valuation_delta',
  'service_consent',
  'medical_consent',
  'human_review',
] as const;

export const claimTransitionEvidenceStatuses = [
  'accepted',
  'signed',
  'reviewed',
  'revoked',
] as const;

export const claimTransitionEvidence = pgTable(
  'claim_transition_evidence',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accessTenantId: text('access_tenant_id').references(() => tenants.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),
    evidenceType: text('evidence_type', { enum: claimTransitionEvidenceTypes }).notNull(),
    evidenceStatus: text('evidence_status', {
      enum: claimTransitionEvidenceStatuses,
    }).notNull(),
    recordedById: text('recorded_by_id').references(() => user.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    sourceDocumentId: text('source_document_id').references(() => claimDocuments.id),
    referenceId: text('reference_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('claim_transition_evidence_claim_type_uq')
      .on(table.tenantId, table.claimId, table.evidenceType)
      .where(sql`${table.evidenceStatus} <> 'revoked'`),
    index('claim_transition_evidence_access_tenant_idx').on(table.accessTenantId),
    index('claim_transition_evidence_claim_idx').on(table.tenantId, table.claimId),
  ]
);

export type ClaimTransitionEvidence = typeof claimTransitionEvidence.$inferSelect;
export type NewClaimTransitionEvidence = typeof claimTransitionEvidence.$inferInsert;
