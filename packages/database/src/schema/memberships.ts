import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { branches } from './rbac';
import { tenants } from './tenants';

// Extracted to own modules; re-exported here for backward compatibility.
export { membershipPlans } from './membership-plans';
import { subscriptions } from './subscriptions';
export { subscriptions };

export const membershipFamilyMembers = pgTable('membership_family_members', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  userId: text('user_id').references(() => user.id),
  name: text('name').notNull(),
  relationship: text('relationship'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const userNotificationPreferences = pgTable('user_notification_preferences', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  emailClaimUpdates: boolean('email_claim_updates').default(true).notNull(),
  emailMarketing: boolean('email_marketing').default(false).notNull(),
  emailNewsletter: boolean('email_newsletter').default(true).notNull(),
  pushClaimUpdates: boolean('push_claim_updates').default(true).notNull(),
  pushMessages: boolean('push_messages').default(true).notNull(),
  inAppAll: boolean('in_app_all').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
});

export const membershipCards = pgTable(
  'membership_cards',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),

    status: text('status', { enum: ['active', 'revoked', 'expired'] })
      .notNull()
      .default('active'),

    // Card Details
    cardNumber: text('card_number').notNull(),
    qrCodeToken: text('qr_code_token').notNull(),

    issuedAt: timestamp('issued_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'),
    revokedAt: timestamp('revoked_at'),
  },
  table => [
    index('idx_cards_user').on(table.userId),
    index('idx_cards_sub').on(table.subscriptionId),
    uniqueIndex('idx_cards_number').on(table.tenantId, table.cardNumber),
  ]
);
