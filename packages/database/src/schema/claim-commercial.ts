import {
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { claims } from './claims';
import { tenants } from './tenants';

const paymentAuthorizationStates = ['pending', 'authorized', 'revoked'] as const;

export const claimEscalationAgreements = pgTable(
  'claim_escalation_agreements',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),
    signedByUserId: text('signed_by_user_id')
      .notNull()
      .references(() => user.id),
    acceptedById: text('accepted_by_id')
      .notNull()
      .references(() => user.id),
    feePercentage: integer('fee_percentage').notNull(),
    minimumFee: decimal('minimum_fee', { precision: 10, scale: 2 }).notNull(),
    legalActionCapPercentage: integer('legal_action_cap_percentage').notNull(),
    paymentAuthorizationState: text('payment_authorization_state', {
      enum: paymentAuthorizationStates,
    })
      .notNull()
      .default('pending'),
    termsVersion: text('terms_version').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('claim_escalation_agreements_claim_uq').on(table.claimId),
    index('claim_escalation_agreements_tenant_idx').on(table.tenantId),
  ]
);
