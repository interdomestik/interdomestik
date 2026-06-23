import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { membershipPlans } from './membership-plans';
import { subscriptionStatusEnum } from './enums';
import { branches } from './rbac';
import { legalEntities } from './tenant-entity-decomposition';
import { tenants } from './tenants';

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
    providerSubscriptionId: text('provider_subscription_id'),
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
    branchId: text('branch_id').references(() => branches.id),
    agentId: text('agent_id').references(() => user.id),
    // Entity-of-record snapshot (T-112 / ARCH-M1-11): captured at acceptance;
    // existing rows backfilled — legalTenantId from tenantId, governingLawSnapshot
    // from tenants.governingLaw. billingEntity and termsVersionAccepted are
    // null for historical rows and populated going forward by the capture path.
    legalTenantId: text('legal_tenant_id').references(() => tenants.id),
    billingEntity: text('billing_entity'),
    governingLawSnapshot: text('governing_law_snapshot'),
    termsVersionAccepted: text('terms_version_accepted'),
    legalEntityId: text('legal_entity_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
  },
  table => [
    index('idx_memberships_branch').on(table.branchId),
    index('idx_memberships_agent').on(table.agentId),
    uniqueIndex('idx_subscriptions_user').on(table.userId),
    uniqueIndex('idx_subscriptions_provider_subscription').on(table.providerSubscriptionId),
    uniqueIndex('subscriptions_tenant_id_id_uq').on(table.tenantId, table.id),
    index('subscriptions_legal_entity_idx').on(table.legalEntityId),
    check(
      'subscriptions_governing_law_snapshot_check',
      sql`${table.governingLawSnapshot} IS NULL OR ${table.governingLawSnapshot} ~ '^[A-Z]{2}$'`
    ),
    foreignKey({
      columns: [table.legalEntityId],
      foreignColumns: [legalEntities.id],
      name: 'subscriptions_legal_entity_id_fk',
    }),
  ]
);
