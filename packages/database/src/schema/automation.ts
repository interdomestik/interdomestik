import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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
