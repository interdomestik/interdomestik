import { boolean, decimal, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { commissionStatusEnum, commissionTypeEnum } from './enums';
import { subscriptions } from './memberships';
import { tenants } from './tenants';

export const agentClients = pgTable('agent_clients', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .default('tenant_mk'),
  agentId: text('agent_id')
    .notNull()
    .references(() => user.id),
  memberId: text('member_id')
    .notNull()
    .references(() => user.id),
  status: text('status').default('active').notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agentCommissions = pgTable('agent_commissions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .default('tenant_mk'),
  agentId: text('agent_id')
    .notNull()
    .references(() => user.id),
  memberId: text('member_id').references(() => user.id),
  subscriptionId: text('subscription_id').references(() => subscriptions.id),
  type: commissionTypeEnum('type').notNull(),
  status: commissionStatusEnum('status').default('pending').notNull(),
  amount: decimal('amount', { precision: 8, scale: 2 }).notNull(),
  currency: text('currency').default('EUR').notNull(),
  earnedAt: timestamp('earned_at').defaultNow(),
  paidAt: timestamp('paid_at'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});

export const agentSettings = pgTable('agent_settings', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id)
    .default('tenant_mk'),
  agentId: text('agent_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  commissionRates: jsonb('commission_rates').$type<Record<string, number>>().default({}).notNull(),
  canNegotiateRates: boolean('can_negotiate_rates').default(false).notNull(),
  tier: text('tier').default('standard'),
  paymentMethod: text('payment_method'),
  paymentDetails: jsonb('payment_details').$type<Record<string, string>>().default({}),
  minPayoutAmount: decimal('min_payout_amount', { precision: 8, scale: 2 }).default('50.00'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').$onUpdate(() => new Date()),
});
