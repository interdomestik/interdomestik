import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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
    status: statusEnum('status').default('draft'),
    caseLifecycleState: text('case_lifecycle_state').$type<ClaimCaseLifecycleState | null>(),
    recoveryLifecycleState: text(
      'recovery_lifecycle_state'
    ).$type<ClaimRecoveryLifecycleState | null>(),
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
  table => [
    index('idx_claims_branch').on(table.branchId),
    index('idx_claims_agent').on(table.agentId),
    index('idx_claims_user_created').on(table.userId, table.createdAt),
    index('idx_claims_status').on(table.status),
    // Performance indexes for branch dashboards and KPI aggregation
    index('idx_claims_tenant_branch').on(table.tenantId, table.branchId),
    index('idx_claims_tenant_branch_status').on(table.tenantId, table.branchId, table.status),
    index('idx_claims_tenant_status_created').on(table.tenantId, table.status, table.createdAt),
    index('idx_claims_tenant_incident_country').on(
      table.tenantId,
      table.incidentCountryCode,
      table.createdAt
    ),
    // Uniqueness for human readable claim number per tenant
    uniqueIndex('idx_claims_tenant_number').on(table.tenantId, table.claimNumber),
    check(
      'claim_case_lifecycle_state_check',
      sql`${table.caseLifecycleState} is null or ${table.caseLifecycleState} in ('draft', 'submitted', 'verification', 'evaluation', 'recovery', 'resolved', 'rejected')`
    ),
    check(
      'claim_recovery_lifecycle_state_check',
      sql`${table.recoveryLifecycleState} is null or ${table.recoveryLifecycleState} in ('not_started', 'negotiation', 'court', 'resolved', 'closed')`
    ),
    check(
      'claim_incident_country_code_check',
      sql`${table.incidentCountryCode} is null or ${table.incidentCountryCode} ~ '^[A-Z]{2}$'`
    ),
    check(
      'claim_incident_jurisdiction_check',
      sql`${table.incidentJurisdiction} is null or ${table.incidentJurisdiction} ~ '^country:[A-Z]{2}$'`
    ),
    check(
      'claim_recovery_law_check',
      sql`${table.recoveryLaw} is null or ${table.recoveryLaw} ~ '^[A-Z]{2}$'`
    ),
  ]
);

export const claimDocuments = pgTable('claim_documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
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
