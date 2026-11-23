import { sql } from 'drizzle-orm';
import {
  check,
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { ClaimCaseLifecycleState, ClaimRecoveryLifecycleState } from '../constants';
import { user } from './auth';
import { branches } from './rbac';
import { tenants } from './tenants';

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
    caseLifecycleState: text('case_lifecycle_state')
      .$type<ClaimCaseLifecycleState>()
      .notNull()
      .default('draft'),
    recoveryLifecycleState: text('recovery_lifecycle_state')
      .$type<ClaimRecoveryLifecycleState>()
      .notNull()
      .default('not_started'),
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
    index('idx_claims_lifecycle').on(table.caseLifecycleState, table.recoveryLifecycleState),
    index('idx_claims_tenant_branch').on(table.tenantId, table.branchId),
    index('idx_claims_tenant_branch_lifecycle').on(
      table.tenantId,
      table.branchId,
      table.caseLifecycleState,
      table.recoveryLifecycleState
    ),
    index('idx_claims_tenant_lifecycle_created').on(
      table.tenantId,
      table.caseLifecycleState,
      table.recoveryLifecycleState,
      table.createdAt
    ),
    index('idx_claims_tenant_incident_country').on(
      table.tenantId,
      table.incidentCountryCode,
      table.createdAt
    ),
    index('idx_claims_access_tenant').on(table.accessTenantId),
    uniqueIndex('idx_claims_tenant_number').on(table.tenantId, table.claimNumber),
    check(
      'claim_case_lifecycle_state_check',
      sql`${table.caseLifecycleState} is null or ${table.caseLifecycleState} in ('draft', 'submitted', 'verification', 'evaluation', 'recovery', 'resolved', 'rejected')`
    ),
    check(
      'claim_recovery_lifecycle_state_check',
      sql`${table.recoveryLifecycleState} is null or ${table.recoveryLifecycleState} in ('not_started', 'submitted_to_airline', 'negotiation', 'court', 'resolved', 'closed')`
    ),
    check(
      'claim_lifecycle_pair_check',
      sql`(${table.caseLifecycleState} = 'draft' and ${table.recoveryLifecycleState} = 'not_started')
        or (${table.caseLifecycleState} = 'submitted' and ${table.recoveryLifecycleState} = 'not_started')
        or (${table.caseLifecycleState} = 'recovery' and ${table.recoveryLifecycleState} in ('submitted_to_airline', 'negotiation', 'court'))
        or (${table.caseLifecycleState} = 'verification' and ${table.recoveryLifecycleState} = 'not_started')
        or (${table.caseLifecycleState} = 'evaluation' and ${table.recoveryLifecycleState} = 'not_started')
        or (${table.caseLifecycleState} = 'resolved' and ${table.recoveryLifecycleState} = 'resolved')
        or (${table.caseLifecycleState} = 'rejected' and ${table.recoveryLifecycleState} = 'closed')`
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
