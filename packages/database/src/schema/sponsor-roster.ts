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

import { user } from './auth';
import { sponsorHandoverIntents } from './sponsor-handover';
import { sponsorTenantPolicy, sponsorTerms } from './sponsors';

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/** ACQ-3b §3.3: the company's list. Each entry is the person's seat for that term. */
export const sponsorRosterEntries = pgTable(
  'sponsor_roster_entries',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    termId: text('term_id').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    emailNormalized: text('email_normalized'),
    emailHmac: text('email_hmac'),
    userId: text('user_id'),
    conflictDecision: text('conflict_decision', { enum: ['accepted', 'rejected'] }),
    conflictDecidedAt: at('conflict_decided_at'),
    addedBy: text('added_by').notNull(),
    addedAt: at('added_at').defaultNow().notNull(),
    leftCompanyAt: at('left_company_at'),
    optedOutAt: at('opted_out_at'),
    startsAt: at('starts_at'),
    handoverIntentId: text('handover_intent_id'),
    revokedAt: at('revoked_at'),
    revokedReason: text('revoked_reason', { enum: ['opted_out', 'left', 'staff'] }),
    outcome: text('outcome', {
      enum: ['pending', 'seated', 'awaiting_paid_end', 'foreign', 'not_eligible', 'staff_review'],
    })
      .notNull()
      .default('pending'),
    reviewReason: text('review_reason', { enum: ['paddle_state', 'empty_interval', 'binding'] }),
    optoutTokenHash: text('optout_token_hash'),
  },
  table => [
    unique('sponsor_roster_entries_tenant_id_id_uq').on(table.tenantId, table.id),
    unique('sponsor_roster_entries_tenant_id_id_user_uq').on(
      table.tenantId,
      table.id,
      table.userId
    ),
    uniqueIndex('sponsor_roster_entries_term_hmac_uq').on(table.termId, table.emailHmac),
    uniqueIndex('sponsor_roster_entries_term_user_uq')
      .on(table.termId, table.userId)
      .where(sql`${table.userId} is not null`),
    uniqueIndex('sponsor_roster_entries_optout_token_uq').on(table.optoutTokenHash),
    index('sponsor_roster_entries_user_idx').on(table.tenantId, table.userId),
    foreignKey({
      name: 'sponsor_roster_entries_term_fk',
      columns: [table.tenantId, table.termId],
      foreignColumns: [sponsorTerms.tenantId, sponsorTerms.id],
    }),
    foreignKey({
      name: 'sponsor_roster_entries_user_fk',
      columns: [table.tenantId, table.userId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'sponsor_roster_entries_added_by_fk',
      columns: [table.tenantId, table.addedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'sponsor_roster_entries_intent_fk',
      columns: [table.tenantId, table.handoverIntentId, table.userId],
      foreignColumns: [
        sponsorHandoverIntents.tenantId,
        sponsorHandoverIntents.id,
        sponsorHandoverIntents.userId,
      ],
    }),
    check(
      'sponsor_roster_entries_decision_check',
      sql`(${table.conflictDecision} is null) = (${table.conflictDecidedAt} is null)
        and (${table.conflictDecision} is null or ${table.userId} is not null)`
    ),
    check(
      'sponsor_roster_entries_revocation_check',
      sql`(${table.revokedAt} is null) = (${table.revokedReason} is null)`
    ),
    check(
      'sponsor_roster_entries_review_check',
      sql`(${table.outcome} = 'staff_review') = (${table.reviewReason} is not null)`
    ),
    check(
      'sponsor_roster_entries_intent_check',
      sql`${table.handoverIntentId} is null or ${table.userId} is not null`
    ),
    sponsorTenantPolicy('sponsor_roster_entries_tenant_policy', table.tenantId),
  ]
).enableRLS();

export const SPONSOR_MAIL_KINDS = [
  'sponsor_notice',
  'handover_pending',
  'handover_confirmed',
  'activation',
  'foreign_account',
  'not_eligible',
  'renewal_notice',
  'membership_end_offer',
  'opt_out_confirmation',
] as const;

/** Mail work for sponsor entries; content and recipient are resolved at send time. */
export const sponsorMailOutbox = pgTable(
  'sponsor_mail_outbox',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    rosterEntryId: text('roster_entry_id'),
    handoverIntentId: text('handover_intent_id'),
    userId: text('user_id'),
    kind: text('kind', { enum: SPONSOR_MAIL_KINDS }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    state: text('state', { enum: ['queued', 'claimed', 'sent', 'skipped', 'failed'] })
      .notNull()
      .default('queued'),
    leaseUntil: at('lease_until'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: at('next_attempt_at').defaultNow().notNull(),
    terminalAt: at('terminal_at'),
    lastErrorCode: text('last_error_code'),
    createdAt: at('created_at').defaultNow().notNull(),
  },
  table => [
    unique('sponsor_mail_outbox_tenant_id_id_uq').on(table.tenantId, table.id),
    uniqueIndex('sponsor_mail_outbox_idempotency_uq').on(table.idempotencyKey),
    index('sponsor_mail_outbox_due_idx').on(table.state, table.nextAttemptAt),
    foreignKey({
      name: 'sponsor_mail_outbox_entry_fk',
      columns: [table.tenantId, table.rosterEntryId],
      foreignColumns: [sponsorRosterEntries.tenantId, sponsorRosterEntries.id],
    }),
    foreignKey({
      name: 'sponsor_mail_outbox_intent_fk',
      columns: [table.tenantId, table.handoverIntentId, table.userId],
      foreignColumns: [
        sponsorHandoverIntents.tenantId,
        sponsorHandoverIntents.id,
        sponsorHandoverIntents.userId,
      ],
    }),
    check(
      'sponsor_mail_outbox_target_check',
      sql`(${table.rosterEntryId} is not null and ${table.handoverIntentId} is null and ${table.userId} is null)
        or (${table.rosterEntryId} is null and ${table.handoverIntentId} is not null and ${table.userId} is not null
          and ${table.kind} = 'membership_end_offer')`
    ),
    check(
      'sponsor_mail_outbox_terminal_check',
      sql`(${table.state} in ('sent', 'skipped', 'failed')) = (${table.terminalAt} is not null)`
    ),
    sponsorTenantPolicy('sponsor_mail_outbox_tenant_policy', table.tenantId),
  ]
).enableRLS();
