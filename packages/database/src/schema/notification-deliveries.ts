import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sponsorTenantPolicy } from './sponsors';

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    kind: text('kind', {
      enum: [
        'claim_submitted',
        'claim_status_changed',
        'claim_recovery_decision',
        'claim_message_to_member',
        'staff_claim_submitted',
        'staff_member_message',
      ],
    }).notNull(),
    channel: text('channel', { enum: ['email', 'push'] }).notNull(),
    recipientUserId: text('recipient_user_id').notNull(),
    claimId: text('claim_id').notNull(),
    subjectMessageId: text('subject_message_id'),
    pushSubscriptionId: text('push_subscription_id'),
    facts: jsonb('facts').notNull(),
    state: text('state', { enum: ['queued', 'claimed', 'sent', 'skipped', 'failed'] })
      .notNull()
      .default('queued'),
    leaseUntil: timestamp('lease_until', { withTimezone: true, mode: 'string' }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    terminalAt: timestamp('terminal_at', { withTimezone: true, mode: 'string' }),
    lastErrorCode: text('last_error_code'),
    lastErrorDetail: text('last_error_detail'),
    skipReason: text('skip_reason', {
      enum: [
        'recipient_missing',
        'recipient_out_of_scope',
        'email_unverified',
        'email_suppressed',
        'push_disabled',
        'subscription_gone',
        'claim_gone',
        'stale',
      ],
    }),
    locale: text('locale', { enum: ['sq', 'en', 'sr', 'mk', 'de'] }),
    avoidTransport: text('avoid_transport', { enum: ['smtp', 'resend'] }),
    transport: text('transport', { enum: ['smtp', 'resend', 'webpush'] }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  },
  table => [
    uniqueIndex('notification_deliveries_tenant_id_uq').on(table.tenantId, table.id),
    uniqueIndex('notification_deliveries_key_uq').on(table.tenantId, table.idempotencyKey),
    index('notification_deliveries_due_idx').on(table.state, table.nextAttemptAt),
    index('notification_deliveries_created_idx').on(table.tenantId, table.state, table.createdAt),
    check(
      'notification_deliveries_kind_check',
      sql`${table.kind} in ('claim_submitted', 'claim_status_changed', 'claim_recovery_decision', 'claim_message_to_member', 'staff_claim_submitted', 'staff_member_message')`
    ),
    check('notification_deliveries_channel_check', sql`${table.channel} in ('email', 'push')`),
    check(
      'notification_deliveries_subscription_check',
      sql`(${table.channel} = 'push') = (${table.pushSubscriptionId} is not null)`
    ),
    check('notification_deliveries_facts_check', sql`jsonb_typeof(${table.facts}) = 'object'`),
    check(
      'notification_deliveries_state_check',
      sql`${table.state} in ('queued', 'claimed', 'sent', 'skipped', 'failed')`
    ),
    check(
      'notification_deliveries_lease_check',
      sql`(${table.state} = 'claimed') = (${table.leaseUntil} is not null)`
    ),
    check('notification_deliveries_attempts_check', sql`${table.attempts} between 0 and 8`),
    check(
      'notification_deliveries_terminal_check',
      sql`(${table.state} in ('sent', 'skipped', 'failed')) = (${table.terminalAt} is not null)`
    ),
    check(
      'notification_deliveries_error_code_check',
      sql`${table.lastErrorCode} ~ '^[a-z][a-z0-9_]{0,63}$'`
    ),
    check(
      'notification_deliveries_error_detail_check',
      sql`char_length(${table.lastErrorDetail}) <= 300`
    ),
    check(
      'notification_deliveries_skip_check',
      sql`${table.skipReason} in ('recipient_missing', 'recipient_out_of_scope', 'email_unverified', 'email_suppressed', 'push_disabled', 'subscription_gone', 'claim_gone', 'stale')`
    ),
    check(
      'notification_deliveries_locale_check',
      sql`${table.locale} in ('sq', 'en', 'sr', 'mk', 'de')`
    ),
    check(
      'notification_deliveries_transport_check',
      sql`${table.transport} in ('smtp', 'resend', 'webpush')`
    ),
    check(
      'notification_deliveries_avoid_check',
      sql`${table.avoidTransport} in ('smtp', 'resend')`
    ),
    sponsorTenantPolicy('notification_deliveries_tenant_policy', table.tenantId),
  ]
).enableRLS();
