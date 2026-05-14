import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { claims } from './claims';
import { branches } from './rbac';
import { tenants } from './tenants';

export const crmLeads = pgTable(
  'crm_leads',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => user.id),
    branchId: text('branch_id').references(() => branches.id),
    type: text('type').notNull(), // 'individual', 'business'
    fullName: text('full_name'),
    companyName: text('company_name'),
    phone: text('phone'),
    email: text('email'),
    source: text('source'),
    stage: text('stage').notNull(), // 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'
    score: integer('score').default(0),
    notes: text('notes'),
    lastContactedAt: timestamp('last_contacted_at'),
    wonAt: timestamp('won_at'),
    lostAt: timestamp('lost_at'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  table => [
    uniqueIndex('crm_leads_tenant_id_id_uq').on(table.tenantId, table.id),
    check(
      'crm_leads_stage_check',
      sql`${table.stage} in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')`
    ),
    check(
      'crm_leads_terminal_timestamp_check',
      sql`(${table.stage} = 'won' and ${table.wonAt} is not null and ${table.lostAt} is null) or (${table.stage} = 'lost' and ${table.lostAt} is not null and ${table.wonAt} is null) or (${table.stage} not in ('won', 'lost') and ${table.wonAt} is null and ${table.lostAt} is null)`
    ),
  ]
);

export const crmLeadStageHistory = pgTable(
  'crm_lead_stage_history',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    leadId: text('lead_id')
      .notNull()
      .references(() => crmLeads.id, { onDelete: 'cascade' }),
    fromStage: text('from_stage'),
    toStage: text('to_stage').notNull(),
    changedById: text('changed_by_id')
      .notNull()
      .references(() => user.id),
    occurredAt: timestamp('occurred_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('crm_lead_stage_history_tenant_lead_occurred_idx').on(
      table.tenantId,
      table.leadId,
      table.occurredAt
    ),
    index('crm_lead_stage_history_tenant_to_stage_occurred_idx').on(
      table.tenantId,
      table.toStage,
      table.occurredAt
    ),
    check(
      'crm_lead_stage_history_from_stage_check',
      sql`${table.fromStage} is null or ${table.fromStage} in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')`
    ),
    check(
      'crm_lead_stage_history_to_stage_check',
      sql`${table.toStage} in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')`
    ),
  ]
);

export const crmLeadOwnershipHistory = pgTable(
  'crm_lead_ownership_history',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    leadId: text('lead_id')
      .notNull()
      .references(() => crmLeads.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => user.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    effectiveFrom: timestamp('effective_from').notNull(),
    effectiveTo: timestamp('effective_to'),
    reason: text('reason').notNull(),
    changedById: text('changed_by_id').references(() => user.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    index('crm_lead_ownership_history_tenant_lead_effective_idx').on(
      table.tenantId,
      table.leadId,
      table.effectiveFrom
    ),
    index('crm_lead_ownership_history_tenant_agent_effective_idx').on(
      table.tenantId,
      table.agentId,
      table.effectiveFrom
    ),
    uniqueIndex('crm_lead_ownership_history_one_open_idx')
      .on(table.tenantId, table.leadId)
      .where(sql`${table.effectiveTo} is null`),
  ]
);

export const crmActivities = pgTable(
  'crm_activities',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    leadId: text('lead_id')
      .notNull()
      .references(() => crmLeads.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => user.id),
    branchId: text('branch_id').references(() => branches.id),
    type: text('type').notNull(), // 'call', 'meeting', 'email', 'note', 'other', 'follow_up'
    summary: text('summary').notNull(), // treated as subject
    description: text('description'),
    occurredAt: timestamp('occurred_at').defaultNow(),
    scheduledAt: timestamp('scheduled_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  table => [
    index('crm_activities_tenant_agent_type_completed_scheduled_idx').on(
      table.tenantId,
      table.agentId,
      table.type,
      table.completedAt,
      table.scheduledAt
    ),
    index('crm_activities_tenant_lead_occurred_idx').on(
      table.tenantId,
      table.leadId,
      table.occurredAt
    ),
    index('crm_activities_tenant_branch_occurred_idx').on(
      table.tenantId,
      table.branchId,
      table.occurredAt
    ),
    foreignKey({
      columns: [table.tenantId, table.leadId],
      foreignColumns: [crmLeads.tenantId, crmLeads.id],
      name: 'crm_activities_tenant_lead_fk',
    }),
    check(
      'crm_activities_type_check',
      sql`${table.type} in ('call', 'email', 'meeting', 'note', 'other', 'follow_up')`
    ),
  ]
);

export const crmPipelines = pgTable(
  'crm_pipelines',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    branchId: text('branch_id').references(() => branches.id),
    name: text('name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedById: text('archived_by_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    uniqueIndex('crm_pipelines_tenant_id_id_uq').on(table.tenantId, table.id),
    index('crm_pipelines_tenant_archived_idx').on(table.tenantId, table.archivedAt),
    uniqueIndex('crm_pipelines_tenant_branch_name_active_uq')
      .on(table.tenantId, table.branchId, table.name)
      .where(sql`${table.archivedAt} is null and ${table.branchId} is not null`),
    uniqueIndex('crm_pipelines_tenant_name_active_uq')
      .on(table.tenantId, table.name)
      .where(sql`${table.archivedAt} is null and ${table.branchId} is null`),
  ]
);

export const crmPipelineStages = pgTable(
  'crm_pipeline_stages',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => crmPipelines.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    order: integer('order').notNull(),
    probability: integer('probability').notNull(),
    isWon: boolean('is_won').default(false).notNull(),
    isLost: boolean('is_lost').default(false).notNull(),
    expectedDurationDays: integer('expected_duration_days'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedById: text('archived_by_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    uniqueIndex('crm_pipeline_stages_tenant_id_id_uq').on(table.tenantId, table.id),
    index('crm_pipeline_stages_tenant_pipeline_order_idx').on(
      table.tenantId,
      table.pipelineId,
      table.order
    ),
    uniqueIndex('crm_pipeline_stages_active_order_uq')
      .on(table.tenantId, table.pipelineId, table.order)
      .where(sql`${table.archivedAt} is null`),
    uniqueIndex('crm_pipeline_stages_one_won_active_uq')
      .on(table.tenantId, table.pipelineId)
      .where(sql`${table.isWon} = true and ${table.archivedAt} is null`),
    foreignKey({
      columns: [table.tenantId, table.pipelineId],
      foreignColumns: [crmPipelines.tenantId, crmPipelines.id],
      name: 'crm_pipeline_stages_tenant_pipeline_fk',
    }).onDelete('cascade'),
    check(
      'crm_pipeline_stages_probability_check',
      sql`${table.probability} >= 0 and ${table.probability} <= 100`
    ),
    check('crm_pipeline_stages_terminal_check', sql`not (${table.isWon} and ${table.isLost})`),
  ]
);

export const crmLossReasons = pgTable(
  'crm_loss_reasons',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    branchId: text('branch_id').references(() => branches.id),
    code: text('code').notNull(),
    label: text('label').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedById: text('archived_by_id').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    uniqueIndex('crm_loss_reasons_tenant_id_id_uq').on(table.tenantId, table.id),
    index('crm_loss_reasons_tenant_archived_idx').on(table.tenantId, table.archivedAt),
    uniqueIndex('crm_loss_reasons_tenant_branch_code_active_uq')
      .on(table.tenantId, table.branchId, table.code)
      .where(sql`${table.archivedAt} is null and ${table.branchId} is not null`),
    uniqueIndex('crm_loss_reasons_tenant_code_active_uq')
      .on(table.tenantId, table.code)
      .where(sql`${table.archivedAt} is null and ${table.branchId} is null`),
  ]
);

// Legacy lead-linked deal rows remain supported during the migration window. Normalized CRM04
// writes may be account-backed before a legacy lead link exists, so leadId is intentionally nullable.
export const crmDeals = pgTable(
  'crm_deals',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    leadId: text('lead_id').references(() => crmLeads.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => user.id),
    branchId: text('branch_id').references(() => branches.id),
    accountId: text('account_id'),
    contactId: text('contact_id'),
    pipelineId: text('pipeline_id').references(() => crmPipelines.id),
    currentStageId: text('current_stage_id').references(() => crmPipelineStages.id),
    expectedCloseAt: timestamp('expected_close_at', { withTimezone: true }),
    forecastCategory: text('forecast_category'),
    currencyCode: text('currency_code'),
    valueAmountMinor: integer('value_amount_minor'),
    lossReasonId: text('loss_reason_id').references(() => crmLossReasons.id),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedById: text('archived_by_id').references(() => user.id),
    membershipPlanId: text('membership_plan_id'), // FK added via relations
    valueCents: integer('value_cents').default(0),
    stage: text('stage').notNull(), // 'proposal', 'negotiation', 'closed_won', 'closed_lost'
    status: text('status').default('open'),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  table => [
    uniqueIndex('crm_deals_tenant_id_id_uq').on(table.tenantId, table.id),
    index('crm_deals_tenant_pipeline_stage_idx').on(
      table.tenantId,
      table.pipelineId,
      table.currentStageId
    ),
    index('crm_deals_tenant_branch_stage_idx').on(
      table.tenantId,
      table.branchId,
      table.currentStageId
    ),
    index('crm_deals_tenant_archived_idx').on(table.tenantId, table.archivedAt),
    foreignKey({
      columns: [table.tenantId, table.pipelineId],
      foreignColumns: [crmPipelines.tenantId, crmPipelines.id],
      name: 'crm_deals_tenant_pipeline_fk',
    }),
    foreignKey({
      columns: [table.tenantId, table.currentStageId],
      foreignColumns: [crmPipelineStages.tenantId, crmPipelineStages.id],
      name: 'crm_deals_tenant_current_stage_fk',
    }),
    foreignKey({
      columns: [table.tenantId, table.lossReasonId],
      foreignColumns: [crmLossReasons.tenantId, crmLossReasons.id],
      name: 'crm_deals_tenant_loss_reason_fk',
    }),
    check(
      'crm_deals_forecast_category_check',
      sql`${table.forecastCategory} is null or ${table.forecastCategory} in ('pipeline', 'best', 'commit', 'omitted', 'closed')`
    ),
    check(
      'crm_deals_currency_code_check',
      sql`${table.currencyCode} is null or ${table.currencyCode} ~ '^[A-Z]{3}$'`
    ),
    check(
      'crm_deals_value_amount_minor_check',
      sql`${table.valueAmountMinor} is null or ${table.valueAmountMinor} >= 0`
    ),
  ]
);

export const crmDealStageHistory = pgTable(
  'crm_deal_stage_history',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    dealId: text('deal_id')
      .notNull()
      .references(() => crmDeals.id),
    pipelineId: text('pipeline_id')
      .notNull()
      .references(() => crmPipelines.id),
    fromStageId: text('from_stage_id').references(() => crmPipelineStages.id),
    toStageId: text('to_stage_id')
      .notNull()
      .references(() => crmPipelineStages.id),
    kind: text('kind').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    lossReasonId: text('loss_reason_id').references(() => crmLossReasons.id),
    reason: text('reason'),
    idempotencyKey: text('idempotency_key'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index('crm_deal_stage_history_tenant_deal_occurred_idx').on(
      table.tenantId,
      table.dealId,
      table.occurredAt
    ),
    index('crm_deal_stage_history_tenant_to_stage_occurred_idx').on(
      table.tenantId,
      table.toStageId,
      table.occurredAt
    ),
    foreignKey({
      columns: [table.tenantId, table.dealId],
      foreignColumns: [crmDeals.tenantId, crmDeals.id],
      name: 'crm_deal_stage_history_tenant_deal_fk',
    }),
    foreignKey({
      columns: [table.tenantId, table.pipelineId],
      foreignColumns: [crmPipelines.tenantId, crmPipelines.id],
      name: 'crm_deal_stage_history_tenant_pipeline_fk',
    }),
    foreignKey({
      columns: [table.tenantId, table.fromStageId],
      foreignColumns: [crmPipelineStages.tenantId, crmPipelineStages.id],
      name: 'crm_deal_stage_history_tenant_from_stage_fk',
    }),
    foreignKey({
      columns: [table.tenantId, table.toStageId],
      foreignColumns: [crmPipelineStages.tenantId, crmPipelineStages.id],
      name: 'crm_deal_stage_history_tenant_to_stage_fk',
    }),
    foreignKey({
      columns: [table.tenantId, table.lossReasonId],
      foreignColumns: [crmLossReasons.tenantId, crmLossReasons.id],
      name: 'crm_deal_stage_history_tenant_loss_reason_fk',
    }),
    check(
      'crm_deal_stage_history_kind_check',
      sql`${table.kind} in ('created', 'stage_changed', 'won', 'lost', 'reopened')`
    ),
  ]
);

export const crmDealBackfillQuarantine = pgTable(
  'crm_deal_backfill_quarantine',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    dealId: text('deal_id')
      .notNull()
      .references(() => crmDeals.id),
    reasonCode: text('reason_code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex('crm_deal_backfill_quarantine_tenant_deal_reason_uq').on(
      table.tenantId,
      table.dealId,
      table.reasonCode
    ),
    foreignKey({
      columns: [table.tenantId, table.dealId],
      foreignColumns: [crmDeals.tenantId, crmDeals.id],
      name: 'crm_deal_backfill_quarantine_tenant_deal_fk',
    }),
  ]
);

export const memberActivities = pgTable(
  'member_activities',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => user.id),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id),
    type: text('type').notNull(), // 'call', 'email', 'meeting', 'note', 'other'
    subject: text('subject').notNull(),
    description: text('description'),
    occurredAt: timestamp('occurred_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  table => [
    index('member_activities_tenant_member_occurred_idx').on(
      table.tenantId,
      table.memberId,
      table.occurredAt
    ),
    index('member_activities_tenant_agent_occurred_idx').on(
      table.tenantId,
      table.agentId,
      table.occurredAt
    ),
  ]
);

export const supportHandoffs = pgTable(
  'support_handoffs',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id),
    branchId: text('branch_id').references(() => branches.id),
    claimId: text('claim_id').references(() => claims.id),
    source: text('source').notNull().default('member_help'),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    contactPreference: text('contact_preference').notNull().default('staff_reply'),
    status: text('status').notNull().default('open'),
    urgency: text('urgency').notNull(),
    trustRisk: text('trust_risk').notNull(),
    staffId: text('staff_id').references(() => user.id),
    acceptedAt: timestamp('accepted_at'),
    acceptedById: text('accepted_by_id').references(() => user.id),
    reassignedAt: timestamp('reassigned_at'),
    reassignedById: text('reassigned_by_id').references(() => user.id),
    reassignReason: text('reassign_reason'),
    closedAt: timestamp('closed_at'),
    closedById: text('closed_by_id').references(() => user.id),
    closeReason: text('close_reason'),
    lifecycleVersion: integer('lifecycle_version').notNull().default(0),
    publicResponse: text('public_response'),
    publicResponseAt: timestamp('public_response_at'),
    publicResponseById: text('public_response_by_id').references(() => user.id),
    publicResponseVersion: integer('public_response_version').notNull().default(0),
    publicResponseAcknowledgedAt: timestamp('public_response_acknowledged_at'),
    publicResponseAcknowledgedById: text('public_response_acknowledged_by_id').references(
      () => user.id
    ),
    publicResponseAcknowledgedVersion: integer('public_response_acknowledged_version'),
    memberReply: text('member_reply'),
    memberReplyAt: timestamp('member_reply_at'),
    memberReplyResponseVersion: integer('member_reply_response_version'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('support_handoffs_tenant_status_created_idx').on(
      table.tenantId,
      table.status,
      table.createdAt
    ),
    index('support_handoffs_tenant_branch_status_created_idx').on(
      table.tenantId,
      table.branchId,
      table.status,
      table.createdAt
    ),
    index('support_handoffs_tenant_staff_status_created_idx').on(
      table.tenantId,
      table.staffId,
      table.status,
      table.createdAt
    ),
    index('support_handoffs_tenant_claim_idx').on(table.tenantId, table.claimId),
    index('support_handoffs_tenant_member_created_idx').on(
      table.tenantId,
      table.memberId,
      table.createdAt
    ),
    index('support_handoffs_tenant_member_status_response_idx')
      .on(table.tenantId, table.memberId, table.status, table.publicResponseAt)
      .where(sql`${table.publicResponse} is not null`),
    check(
      'support_handoffs_public_response_length_check',
      sql`${table.publicResponse} is null or char_length(${table.publicResponse}) <= 1000`
    ),
    check(
      'support_handoffs_member_reply_length_check',
      sql`${table.memberReply} is null or char_length(${table.memberReply}) <= 1000`
    ),
  ]
);

// Legacy leads table
export const leads = pgTable('leads', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  category: text('category').notNull(),
  status: text('status').default('new'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').$onUpdate(() => new Date()),
});
