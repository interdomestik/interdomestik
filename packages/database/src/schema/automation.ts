import { jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { subscriptions } from './memberships';

export const automationLogs = pgTable('automation_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').references(() => subscriptions.id, {
    onDelete: 'set null',
  }),
  type: text('type').notNull(), // 'onboarding', 'checkin', 'tip_1', etc.
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  metadata: jsonb('metadata'),
});

export const engagementEmailSends = pgTable(
  'engagement_email_sends',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    templateKey: text('template_key').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    status: text('status').notNull(), // 'pending' | 'sent' | 'skipped' | 'error'
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  table => ({
    dedupeKeyUq: uniqueIndex('engagement_email_sends_dedupe_key_uq').on(table.dedupeKey),
  })
);
