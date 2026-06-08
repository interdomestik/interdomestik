import { boolean, decimal, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { membershipTierEnum } from './enums';
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
