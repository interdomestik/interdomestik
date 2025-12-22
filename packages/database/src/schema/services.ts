import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { subscriptions } from './memberships';

export const referrals = pgTable('referrals', {
  id: text('id').primaryKey(),
  referrerId: text('referrer_id')
    .notNull()
    .references(() => user.id),
  referredId: text('referred_id')
    .notNull()
    .references(() => user.id),
  referralCode: text('referral_code').notNull(),
  status: text('status').default('pending'),
  referrerRewardCents: integer('referrer_reward_cents'),
  referredRewardCents: integer('referred_reward_cents'),
  rewardedAt: timestamp('rewarded_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const serviceUsage = pgTable('service_usage', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  subscriptionId: text('subscription_id')
    .notNull()
    .references(() => subscriptions.id),
  serviceCode: text('service_code').notNull(),
  usedAt: timestamp('used_at').defaultNow(),
});

export const serviceRequests = pgTable('service_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  subscriptionId: text('subscription_id').references(() => subscriptions.id),
  serviceCode: text('service_code').notNull(),
  status: text('status').default('open'),
  handledById: text('handled_by_id').references(() => user.id),
  requestedAt: timestamp('requested_at').defaultNow(),
  closedAt: timestamp('closed_at'),
  notes: text('notes'),
});

export const partnerDiscountUsage = pgTable('partner_discount_usage', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  partnerName: text('partner_name').notNull(),
  estimatedSavingsCents: integer('estimated_savings_cents'),
  usedAt: timestamp('used_at').defaultNow(),
});

export const leadDownloads = pgTable('lead_downloads', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  resourceCode: text('resource_code').notNull(),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  marketingOptIn: boolean('marketing_opt_in').default(false),
  convertedToMember: boolean('converted_to_member').default(false),
  downloadedAt: timestamp('downloaded_at').defaultNow(),
});
