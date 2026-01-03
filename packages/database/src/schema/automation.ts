import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { subscriptions } from './memberships';
import { tenants } from './tenants';

export const automationLogs = pgTable('automation_logs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
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
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
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
    userIdIdx: index('engagement_email_sends_user_id_idx').on(table.userId),
    subscriptionIdIdx: index('engagement_email_sends_subscription_id_idx').on(table.subscriptionId),
    createdAtIdx: index('engagement_email_sends_created_at_idx').on(table.createdAt),
  })
);

export const npsSurveyTokens = pgTable(
  'nps_survey_tokens',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    dedupeKey: text('dedupe_key').notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  table => ({
    dedupeKeyUq: uniqueIndex('nps_survey_tokens_dedupe_key_uq').on(table.dedupeKey),
    tokenUq: uniqueIndex('nps_survey_tokens_token_uq').on(table.token),
    userIdIdx: index('nps_survey_tokens_user_id_idx').on(table.userId),
    subscriptionIdIdx: index('nps_survey_tokens_subscription_id_idx').on(table.subscriptionId),
    createdAtIdx: index('nps_survey_tokens_created_at_idx').on(table.createdAt),
  })
);

export const npsSurveyResponses = pgTable(
  'nps_survey_responses',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    tokenId: text('token_id')
      .notNull()
      .references(() => npsSurveyTokens.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subscriptionId: text('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    score: integer('score').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  table => ({
    userIdIdx: index('nps_survey_responses_user_id_idx').on(table.userId),
    subscriptionIdIdx: index('nps_survey_responses_subscription_id_idx').on(table.subscriptionId),
    createdAtIdx: index('nps_survey_responses_created_at_idx').on(table.createdAt),
  })
);
