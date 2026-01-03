import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { tenants } from './tenants';

// Phase 5: Notifications table
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .default('tenant_mk'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'claim_update', 'message', 'system'
  title: text('title').notNull(),
  content: text('content').notNull(),
  actionUrl: text('action_url'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Phase 5: Email campaign logs for tracking sent sequences
export const emailCampaignLogs = pgTable('email_campaign_logs', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .default('tenant_mk'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  campaignId: text('campaign_id').notNull(), // e.g., 'welcome_day_1'
  sentAt: timestamp('sent_at').defaultNow().notNull(),
});
