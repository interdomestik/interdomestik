import { sql } from 'drizzle-orm';
import { boolean, check, decimal, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { documentCategoryEnum, statusEnum } from './enums';
import { branches } from './rbac';
import { tenants } from './tenants';
import type { ClaimCaseLifecycleState, ClaimRecoveryLifecycleState } from '../constants';
export const claims = pgTable(
  'claim',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accessTenantId: text('access_tenant_id').references(() => tenants.id),
    claimNumber: text('claim_number'),
    userId: text('userId')
      .notNull()
      .references(() => user.id),
    agentId: text('agent_id').references(() => user.id),
    branchId: text('branch_id').references(() => branches.id),
    staffId: text('staffId').references(() => user.id),
    assignedAt: timestamp('assignedAt'),
    assignedById: text('assignedById').references(() => user.id),
    title: text('title').notNull(),
    description: text('description'),
    caseLifecycleState: text('case_lifecycle_state').$type<ClaimCaseLifecycleState>().notNull().default('draft'),
    recoveryLifecycleState: text('recovery_lifecycle_state').$type<ClaimRecoveryLifecycleState>().notNull().default('not_started'),
    incidentCountryCode: text('incident_country_code'),
    incidentJurisdiction: text('incident_jurisdiction'),
    recoveryLaw: text('recovery_law'),
    recoveryLegalTenantId: text('recovery_legal_tenant_id').references(() => tenants.id),
    lifecycleVersion: integer('lifecycle_version').notNull().default(0),
    origin: text('origin').default('portal').notNull(),
    originRefId: text('origin_ref_id'),
    category: text('category').notNull(),
    companyName: text('companyName').notNull(),
    claimAmount: decimal('amount', { precision: 10, scale: 2 }),
    currency: text('currency').default('EUR'),
    createdAt: timestamp('createdAt').defaultNow(),
    updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
    statusUpdatedAt: timestamp('statusUpdatedAt'),
  },
  table => {
    const t = table;
    const c = t.caseLifecycleState;
    const r = t.recoveryLifecycleState;
    return [
    index('idx_claims_branch').on(t.branchId),
    index('idx_claims_agent').on(t.agentId),
    index('idx_claims_user_created').on(t.userId, t.createdAt),
    index('idx_claims_lifecycle').on(c, r),
    index('idx_claims_tenant_branch').on(t.tenantId, t.branchId),
    index('idx_claims_tenant_branch_lifecycle').on(t.tenantId, t.branchId, c, r),
    index('idx_claims_tenant_lifecycle_created').on(t.tenantId, c, r, t.createdAt),
    index('idx_claims_tenant_incident_country').on(t.tenantId, t.incidentCountryCode, t.createdAt),
    index('idx_claims_access_tenant').on(t.accessTenantId),
    uniqueIndex('idx_claims_tenant_number').on(t.tenantId, t.claimNumber),
    check(
      'claim_case_lifecycle_state_check',
    sql`${c} is null or ${c} in ('draft','submitted','verification','evaluation','recovery','resolved','rejected')`
    ),
    check(
      'claim_recovery_lifecycle_state_check',
    sql`${r} is null or ${r} in ('not_started','submitted_to_airline','negotiation','court','resolved','closed')`
    ),
    check(
      'claim_lifecycle_state_pair_check',
    sql`(${c},${r}) in (('draft','not_started'),('submitted','not_started'),('recovery','submitted_to_airline'),('verification','not_started'),('evaluation','not_started'),('recovery','negotiation'),('recovery','court'),('resolved','resolved'),('rejected','closed'))`
    ),
    check(
      'claim_incident_country_code_check',
      sql`${t.incidentCountryCode} is null or ${t.incidentCountryCode} ~ '^[A-Z]{2}$'`
    ),
    check(
      'claim_incident_jurisdiction_check',
      sql`${t.incidentJurisdiction} is null or ${t.incidentJurisdiction} ~ '^country:[A-Z]{2}$'`
    ),
    check(
      'claim_recovery_law_check',
      sql`${t.recoveryLaw} is null or ${t.recoveryLaw} ~ '^[A-Z]{2}$'`
    ),
    ];
  }
);
export const claimDocuments = pgTable(
  'claim_documents',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().references(() => tenants.id),
    accessTenantId: text('access_tenant_id').references(() => tenants.id),
    claimId: text('claim_id').notNull().references(() => claims.id),
    name: text('name').notNull(),
    filePath: text('file_path').notNull(),
    fileType: text('file_type').notNull(),
    fileSize: integer('file_size').notNull(),
    bucket: text('bucket').notNull().default('claim-evidence'),
    classification: text('classification').notNull().default('pii'),
    category: documentCategoryEnum('category').default('evidence').notNull(),
    uploadedBy: text('uploaded_by').notNull().references(() => user.id),
    createdAt: timestamp('created_at').defaultNow(),
  },
  table => [index('claim_documents_access_tenant_idx').on(table.accessTenantId)]
);
export const claimMessages = pgTable('claim_messages', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  claimId: text('claim_id').notNull().references(() => claims.id),
  senderId: text('sender_id').notNull().references(() => user.id),
  content: text('content').notNull(),
  isInternal: boolean('is_internal').default(false),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
export const claimStageHistory = pgTable('claim_stage_history', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  claimId: text('claim_id').notNull().references(() => claims.id),
  fromStatus: statusEnum('from_status'),
  toStatus: statusEnum('to_status').notNull(),
  changedById: text('changed_by_id').references(() => user.id),
  changedByRole: text('changed_by_role'),
  note: text('note'),
  isPublic: boolean('is_public').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
