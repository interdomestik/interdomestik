import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { subscriptions } from './memberships';
import { tenants } from './tenants';

const memberReferralRewardStatusValues = [
  'pending',
  'approved',
  'credited',
  'paid',
  'void',
] as const;
const memberReferralRewardTypeValues = ['fixed', 'percent'] as const;
const memberReferralSettlementModeValues = ['credit_only', 'credit_or_payout'] as const;

export const referrals = pgTable('referrals', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
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

export const memberReferralRewards = pgTable(
  'member_referral_rewards',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    referralId: text('referral_id')
      .notNull()
      .references(() => referrals.id),
    subscriptionId: text('subscription_id')
      .notNull()
      .references(() => subscriptions.id),
    referrerMemberId: text('referrer_member_id')
      .notNull()
      .references(() => user.id),
    referredMemberId: text('referred_member_id')
      .notNull()
      .references(() => user.id),
    qualifyingEventId: text('qualifying_event_id').notNull(),
    qualifyingEventType: text('qualifying_event_type').notNull(),
    rewardType: text('reward_type', { enum: memberReferralRewardTypeValues })
      .notNull()
      .default('fixed'),
    status: text('status', { enum: memberReferralRewardStatusValues }).notNull().default('pending'),
    rewardCents: integer('reward_cents').notNull(),
    rewardPercentBps: integer('reward_percent_bps'),
    currencyCode: text('currency_code').notNull().default('EUR'),
    earnedAt: timestamp('earned_at').defaultNow(),
    approvedAt: timestamp('approved_at'),
    creditedAt: timestamp('credited_at'),
    paidAt: timestamp('paid_at'),
    voidedAt: timestamp('voided_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at'),
  },
  table => [
    uniqueIndex('member_referral_rewards_tenant_subscription_event_uq').on(
      table.tenantId,
      table.subscriptionId,
      table.qualifyingEventType,
      table.qualifyingEventId
    ),
    check('member_referral_rewards_reward_cents_non_negative', sql`${table.rewardCents} >= 0`),
    check(
      'member_referral_rewards_reward_percent_bps_non_negative',
      sql`${table.rewardPercentBps} is null or ${table.rewardPercentBps} >= 0`
    ),
    check(
      'member_referral_rewards_reward_type_check',
      sql`${table.rewardType} in ('fixed', 'percent')`
    ),
    check(
      'member_referral_rewards_reward_amount_check',
      sql`((${table.rewardType} = 'fixed' and ${table.rewardPercentBps} is null and ${table.rewardCents} is not null) or (${table.rewardType} = 'percent' and ${table.rewardPercentBps} is not null and ${table.rewardCents} is not null))`
    ),
    check(
      'member_referral_rewards_status_check',
      sql`${table.status} in ('pending', 'approved', 'credited', 'paid', 'void')`
    ),
    index('member_referral_rewards_tenant_idx').on(table.tenantId),
    index('member_referral_rewards_tenant_subscription_idx').on(
      table.tenantId,
      table.subscriptionId
    ),
    index('member_referral_rewards_tenant_event_idx').on(
      table.tenantId,
      table.qualifyingEventType,
      table.qualifyingEventId
    ),
    index('member_referral_rewards_referral_idx').on(table.referralId),
    index('member_referral_rewards_referrer_idx').on(table.referrerMemberId),
    index('member_referral_rewards_referred_idx').on(table.referredMemberId),
  ]
);

export const memberReferralSettings = pgTable(
  'member_referral_settings',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    enabled: boolean('enabled').default(false).notNull(),
    rewardType: text('reward_type', { enum: memberReferralRewardTypeValues })
      .notNull()
      .default('fixed'),
    fixedRewardCents: integer('fixed_reward_cents'),
    percentRewardBps: integer('percent_reward_bps'),
    referredMemberRewardType: text('referred_member_reward_type', {
      enum: memberReferralRewardTypeValues,
    })
      .notNull()
      .default('fixed'),
    referredMemberFixedRewardCents: integer('referred_member_fixed_reward_cents'),
    referredMemberPercentRewardBps: integer('referred_member_percent_reward_bps'),
    settlementMode: text('settlement_mode', { enum: memberReferralSettlementModeValues })
      .notNull()
      .default('credit_only'),
    payoutThresholdCents: integer('payout_threshold_cents').default(0).notNull(),
    fraudReviewEnabled: boolean('fraud_review_enabled').default(false).notNull(),
    currencyCode: text('currency_code').notNull().default('EUR'),
    qualifyingEventType: text('qualifying_event_type').notNull().default('first_paid_membership'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at'),
  },
  table => [
    uniqueIndex('member_referral_settings_tenant_uq').on(table.tenantId),
    check(
      'member_referral_settings_fixed_reward_cents_non_negative',
      sql`${table.fixedRewardCents} is null or ${table.fixedRewardCents} >= 0`
    ),
    check(
      'member_referral_settings_percent_reward_bps_non_negative',
      sql`${table.percentRewardBps} is null or ${table.percentRewardBps} >= 0`
    ),
    check(
      'member_referral_settings_referred_fixed_reward_cents_non_negative',
      sql`${table.referredMemberFixedRewardCents} is null or ${table.referredMemberFixedRewardCents} >= 0`
    ),
    check(
      'member_referral_settings_referred_percent_reward_bps_non_negative',
      sql`${table.referredMemberPercentRewardBps} is null or ${table.referredMemberPercentRewardBps} >= 0`
    ),
    check(
      'member_referral_settings_payout_threshold_cents_non_negative',
      sql`${table.payoutThresholdCents} >= 0`
    ),
    check(
      'member_referral_settings_reward_type_check',
      sql`${table.rewardType} in ('fixed', 'percent')`
    ),
    check(
      'member_referral_settings_reward_amount_check',
      sql`((${table.rewardType} = 'fixed' and ${table.fixedRewardCents} is not null and ${table.percentRewardBps} is null) or (${table.rewardType} = 'percent' and ${table.percentRewardBps} is not null and ${table.fixedRewardCents} is null))`
    ),
    check(
      'member_referral_settings_referred_reward_type_check',
      sql`${table.referredMemberRewardType} in ('fixed', 'percent')`
    ),
    check(
      'member_referral_settings_referred_reward_amount_check',
      sql`((${table.referredMemberRewardType} = 'fixed' and ${table.referredMemberFixedRewardCents} is not null and ${table.referredMemberPercentRewardBps} is null) or (${table.referredMemberRewardType} = 'percent' and ${table.referredMemberPercentRewardBps} is not null and ${table.referredMemberFixedRewardCents} is null))`
    ),
    check(
      'member_referral_settings_settlement_mode_check',
      sql`${table.settlementMode} in ('credit_only', 'credit_or_payout')`
    ),
    index('member_referral_settings_tenant_idx').on(table.tenantId),
    index('member_referral_settings_tenant_reward_idx').on(table.tenantId, table.rewardType),
  ]
);

export const serviceUsage = pgTable(
  'service_usage',
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
    serviceCode: text('service_code').notNull(),
    usedAt: timestamp('used_at').defaultNow(),
  },
  table => [
    uniqueIndex('service_usage_tenant_subscription_code_uq').on(
      table.tenantId,
      table.subscriptionId,
      table.serviceCode
    ),
  ]
);

export const serviceRequests = pgTable('service_requests', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
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
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  partnerName: text('partner_name').notNull(),
  estimatedSavingsCents: integer('estimated_savings_cents'),
  usedAt: timestamp('used_at').defaultNow(),
});

export const leadDownloads = pgTable('lead_downloads', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id),
  email: text('email').notNull(),
  resourceCode: text('resource_code').notNull(),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  marketingOptIn: boolean('marketing_opt_in').default(false),
  convertedToMember: boolean('converted_to_member').default(false),
  downloadedAt: timestamp('downloaded_at').defaultNow(),
});
