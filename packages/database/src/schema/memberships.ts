import {
  boolean,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { membershipTierEnum, subscriptionStatusEnum } from './enums';
import { branches } from './rbac';
import { tenants } from './tenants';

export const membershipPlans = pgTable('membership_plans', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: text('name').notNull(),
  description: text('description'),
  tier: membershipTierEnum('tier').notNull(),
  interval: text('interval').default('year').notNull(),
  price: decimal('price', { precision: 8, scale: 2 }).notNull(),
  currency: text('currency').default('EUR').notNull(),
  membersIncluded: integer('members_included').default(1).notNull(),
  legalConsultationsPerYear: integer('legal_consultations_per_year'),
  mediationDiscountPercent: integer('mediation_discount_percent').default(0).notNull(),
  successFeePercent: integer('success_fee_percent').default(15).notNull(),
  paddlePriceId: text('paddle_price_id'),
  paddleProductId: text('paddle_product_id'),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .$onUpdate(() => new Date())
    .notNull(),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    planId: text('plan_id').notNull(),
    planKey: text('plan_key').references(() => membershipPlans.id),
    provider: text('provider').default('paddle'),
    providerCustomerId: text('provider_customer_id'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
    canceledAt: timestamp('canceled_at'),
    pastDueAt: timestamp('past_due_at'),
    gracePeriodEndsAt: timestamp('grace_period_ends_at'),
    dunningAttemptCount: integer('dunning_attempt_count').default(0),
    lastDunningAt: timestamp('last_dunning_at'),
    referredByAgentId: text('referred_by_agent_id').references(() => user.id),
    referredByMemberId: text('referred_by_member_id').references(() => user.id),
    referralCode: text('referral_code').unique(),
    acquisitionSource: text('acquisition_source'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    branchId: text('branch_id').references(() => branches.id), // Branch scoping
    agentId: text('agent_id').references(() => user.id), // Assigned agent (replaces referredByAgentId)
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  table => [
    index('idx_memberships_branch').on(table.branchId),
    index('idx_memberships_agent').on(table.agentId),
  ]
);

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
      .references(() => subscriptions.id), // Link to specific subscription

    status: text('status', { enum: ['active', 'revoked', 'expired'] })
      .notNull()
      .default('active'),

    // Card Details
    cardNumber: text('card_number').notNull(),
    qrCodeToken: text('qr_code_token').notNull(), // For generating dynamic QR

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
