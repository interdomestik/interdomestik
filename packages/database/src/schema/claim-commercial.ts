import {
  boolean,
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
import { subscriptions } from './memberships';
import { tenants } from './tenants';

const paymentAuthorizationStates = ['pending', 'authorized', 'revoked'] as const;
const escalationDecisionNextStatuses = ['negotiation', 'court'] as const;
const recoveryDecisionTypes = ['accepted', 'declined'] as const;
const recoveryDeclineReasonCodes = [
  'guidance_only_scope',
  'insufficient_evidence',
  'no_monetary_recovery_path',
  'counterparty_unidentified',
  'time_limit_risk',
  'conflict_or_integrity_concern',
] as const;
const successFeeCollectionMethods = ['deduction', 'payment_method_charge', 'invoice'] as const;

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
    decisionType: text('decision_type', {
      enum: recoveryDecisionTypes,
    }),
    declineReasonCode: text('decline_reason_code', {
      enum: recoveryDeclineReasonCodes,
    }),
    decisionNextStatus: text('decision_next_status', {
      enum: escalationDecisionNextStatuses,
    }),
    decisionReason: text('decision_reason'),
    signedByUserId: text('signed_by_user_id').references(() => user.id),
    acceptedById: text('accepted_by_id')
      .notNull()
      .references(() => user.id),
    feePercentage: integer('fee_percentage'),
    minimumFee: decimal('minimum_fee', { precision: 10, scale: 2 }),
    legalActionCapPercentage: integer('legal_action_cap_percentage'),
    paymentAuthorizationState: text('payment_authorization_state', {
      enum: paymentAuthorizationStates,
    })
      .notNull()
      .default('pending'),
    successFeeRecoveredAmount: decimal('success_fee_recovered_amount', {
      precision: 12,
      scale: 2,
    }),
    successFeeCurrencyCode: text('success_fee_currency_code'),
    successFeeAmount: decimal('success_fee_amount', { precision: 12, scale: 2 }),
    successFeeCollectionMethod: text('success_fee_collection_method', {
      enum: successFeeCollectionMethods,
    }),
    successFeeDeductionAllowed: boolean('success_fee_deduction_allowed'),
    successFeeHasStoredPaymentMethod: boolean('success_fee_has_stored_payment_method'),
    successFeeInvoiceDueAt: timestamp('success_fee_invoice_due_at', { withTimezone: true }),
    successFeeResolvedAt: timestamp('success_fee_resolved_at', { withTimezone: true }),
    successFeeResolvedById: text('success_fee_resolved_by_id').references(() => user.id),
    successFeeSubscriptionId: text('success_fee_subscription_id').references(
      () => subscriptions.id
    ),
    termsVersion: text('terms_version'),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('claim_escalation_agreements_claim_uq').on(table.claimId),
    index('claim_escalation_agreements_tenant_idx').on(table.tenantId),
  ]
);
