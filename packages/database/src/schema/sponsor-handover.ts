import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { subscriptions } from './subscriptions';
import { sponsorTenantPolicy } from './sponsors';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/**
 * ACQ-3b §3.3: one handover per Paddle subscription of an existing paying member. Coverage
 * evidence (`paid_until`) and provider settlement (derived from the attempts) are separate facts.
 */
export const sponsorHandoverIntents = pgTable(
  'sponsor_handover_intents',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    subscriptionId: text('subscription_id').notNull(),
    providerSubscriptionId: text('provider_subscription_id').notNull(),
    state: text('state', {
      enum: ['pending', 'cancel_scheduled', 'void', 'done', 'staff_review', 'closed_by_staff'],
    })
      .notNull()
      .default('pending'),
    staffDisposition: text('staff_disposition', { enum: ['canceled', 'renewing_as_member'] }),
    staffEvidenceId: text('staff_evidence_id'),
    restorationCutoff: at('restoration_cutoff'),
    cancelDispatchedAt: at('cancel_dispatched_at'),
    dispatchPeriodEndsAt: at('dispatch_period_ends_at'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: at('next_attempt_at'),
    paidUntil: at('paid_until'),
    paidUntilEvidence: text('paid_until_evidence'),
    canceledConfirmedAt: at('canceled_confirmed_at'),
    reconciledThrough: at('reconciled_through'),
    reconciliationClosedAt: at('reconciliation_closed_at'),
    createdAt: at('created_at').defaultNow().notNull(),
    updatedAt: at('updated_at').defaultNow().notNull(),
  },
  table => [
    unique('sponsor_handover_intents_tenant_id_id_uq').on(table.tenantId, table.id),
    unique('sponsor_handover_intents_tenant_id_id_user_uq').on(
      table.tenantId,
      table.id,
      table.userId
    ),
    uniqueIndex('sponsor_handover_intents_provider_subscription_uq').on(
      table.providerSubscriptionId
    ),
    uniqueIndex('sponsor_handover_intents_paid_until_evidence_uq').on(table.paidUntilEvidence),
    index('sponsor_handover_intents_due_idx').on(table.tenantId, table.state, table.nextAttemptAt),
    foreignKey({
      name: 'sponsor_handover_intents_subscription_fk',
      columns: [table.tenantId, table.subscriptionId, table.userId],
      foreignColumns: [subscriptions.tenantId, subscriptions.id, subscriptions.userId],
    }),
    check(
      'sponsor_handover_intents_dispatch_check',
      sql`(${table.cancelDispatchedAt} is null) = (${table.dispatchPeriodEndsAt} is null)`
    ),
    check(
      'sponsor_handover_intents_paid_until_check',
      sql`(${table.paidUntil} is null) = (${table.paidUntilEvidence} is null)`
    ),
    check(
      'sponsor_handover_intents_staff_closure_check',
      sql`(${table.state} = 'closed_by_staff') = (${table.staffDisposition} is not null)
        and (${table.staffDisposition} is null) = (${table.staffEvidenceId} is null)
        and (${table.restorationCutoff} is null or ${table.staffDisposition} = 'renewing_as_member')`
    ),
    check(
      'sponsor_handover_intents_void_check',
      sql`${table.state} <> 'void' or ${table.cancelDispatchedAt} is null`
    ),
    sponsorTenantPolicy('sponsor_handover_intents_tenant_policy', table.tenantId),
  ]
).enableRLS();

/**
 * One row per Paddle cancel call, committed before the call. The authorization snapshot is plain
 * values without a foreign key, so roster retention never blocks on or cascades into an attempt.
 */
export const sponsorHandoverCancelAttempts = pgTable(
  'sponsor_handover_cancel_attempts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    intentId: text('intent_id').notNull(),
    attemptNo: integer('attempt_no').notNull(),
    dispatchedAt: at('dispatched_at').defaultNow().notNull(),
    authorizingEntryId: text('authorizing_entry_id').notNull(),
    authorizingTermId: text('authorizing_term_id').notNull(),
    authorizingTermStart: at('authorizing_term_start').notNull(),
    authorizingEnd: at('authorizing_end').notNull(),
    boundaryAt: at('boundary_at').notNull(),
    outcome: text('outcome', { enum: ['unknown', 'scheduled', 'refused', 'moot'] })
      .notNull()
      .default('unknown'),
    evidenceRef: text('evidence_ref'),
    resolvedAt: at('resolved_at'),
  },
  table => [
    unique('sponsor_handover_cancel_attempts_tenant_id_id_uq').on(table.tenantId, table.id),
    uniqueIndex('sponsor_handover_cancel_attempts_intent_no_uq').on(
      table.intentId,
      table.attemptNo
    ),
    foreignKey({
      name: 'sponsor_handover_cancel_attempts_intent_fk',
      columns: [table.tenantId, table.intentId],
      foreignColumns: [sponsorHandoverIntents.tenantId, sponsorHandoverIntents.id],
    }),
    check('sponsor_handover_cancel_attempts_no_check', sql`${table.attemptNo} > 0`),
    check(
      'sponsor_handover_cancel_attempts_boundary_check',
      sql`${table.authorizingTermStart} <= ${table.boundaryAt} and ${table.boundaryAt} < ${table.authorizingEnd}`
    ),
    check(
      'sponsor_handover_cancel_attempts_outcome_check',
      sql`(${table.outcome} = 'unknown') = (${table.resolvedAt} is null)`
    ),
    sponsorTenantPolicy('sponsor_handover_cancel_attempts_tenant_policy', table.tenantId),
  ]
).enableRLS();

/** Append-only: a Paddle charge found after the handover boundary; recorded and escalated once. */
export const sponsorHandoverCharges = pgTable(
  'sponsor_handover_charges',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    intentId: text('intent_id').notNull(),
    providerTransactionId: text('provider_transaction_id').notNull(),
    billingPeriodStartsAt: at('billing_period_starts_at').notNull(),
    foundAt: at('found_at').defaultNow().notNull(),
    staffTaskId: text('staff_task_id'),
  },
  table => [
    unique('sponsor_handover_charges_tenant_id_id_uq').on(table.tenantId, table.id),
    uniqueIndex('sponsor_handover_charges_transaction_uq').on(table.providerTransactionId),
    foreignKey({
      name: 'sponsor_handover_charges_intent_fk',
      columns: [table.tenantId, table.intentId],
      foreignColumns: [sponsorHandoverIntents.tenantId, sponsorHandoverIntents.id],
    }),
    sponsorTenantPolicy('sponsor_handover_charges_tenant_policy', table.tenantId),
  ]
).enableRLS();
