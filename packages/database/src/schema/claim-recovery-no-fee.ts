import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { claims } from './claims';
import { tenants } from './tenants';

export const noFeeEvidenceReasonCodes = [
  'no_recovery',
  'not_billable_under_recovery_scope',
] as const;

export const claimRecoveryNoFeeEvidence = pgTable(
  'claim_recovery_no_fee_evidence',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accessTenantId: text('access_tenant_id').references(() => tenants.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),
    reasonCode: text('reason_code', { enum: noFeeEvidenceReasonCodes }).notNull(),
    reason: text('reason'),
    documentedById: text('documented_by_id')
      .notNull()
      .references(() => user.id),
    documentedAt: timestamp('documented_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('claim_recovery_no_fee_evidence_claim_uq').on(table.tenantId, table.claimId),
    index('claim_recovery_no_fee_evidence_access_tenant_idx').on(table.accessTenantId),
    index('claim_recovery_no_fee_evidence_tenant_idx').on(table.tenantId),
  ]
);
