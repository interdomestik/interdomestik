import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { branches } from './rbac';
import { tenants } from './tenants';

export const memberLeads = pgTable(
  'member_leads',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    agentId: text('agent_id')
      .notNull()
      .references(() => user.id),

    // Contact Info
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),

    // State Machine
    status: text('status', {
      enum: ['new', 'payment_pending', 'converted', 'disqualified', 'expired'],
    })
      .notNull()
      .default('new'),

    // Metadata
    notes: text('notes'),
    convertedUserId: text('converted_user_id').references(() => user.id), // If converted

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    expiresAt: timestamp('expires_at'),
  },
  table => [
    index('idx_leads_tenant').on(table.tenantId),
    index('idx_leads_branch').on(table.branchId),
    index('idx_leads_agent').on(table.agentId),
    index('idx_leads_status').on(table.status),
    // Ensure uniqueness of email per tenant to prevent duplicate leads/members
    uniqueIndex('idx_leads_tenant_email').on(table.tenantId, table.email),
    // Performance indexes for branch dashboards
    index('idx_member_leads_tenant_branch').on(table.tenantId, table.branchId),
    index('idx_member_leads_tenant_agent').on(table.tenantId, table.agentId),
  ]
);

export const leadPaymentAttempts = pgTable(
  'lead_payment_attempts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    leadId: text('lead_id')
      .notNull()
      .references(() => memberLeads.id),

    method: text('method', { enum: ['card', 'cash'] }).notNull(),
    status: text('status', {
      enum: [
        'pending', // Initial state
        'succeeded', // Card success or Cash verified
        'failed', // Card failed
        'canceled', // User/Agent canceled
        'rejected', // BM rejected cash
        'needs_info', // Ops requested more info
      ],
    })
      .notNull()
      .default('pending'),

    amount: integer('amount').notNull(), // In cents
    currency: text('currency').notNull().default('EUR'),

    // Card Specific
    paddleCheckoutId: text('paddle_checkout_id'),
    paddleTransactionId: text('paddle_transaction_id'),

    // Cash Specific
    verifiedBy: text('verified_by').references(() => user.id),
    verifiedAt: timestamp('verified_at'),
    verificationNote: text('verification_note'),
    isResubmission: boolean('is_resubmission').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('idx_lead_payments_lead').on(table.leadId),
    index('idx_lead_payments_tenant').on(table.tenantId),
    // Performance index for cash pending KPI
    index('idx_lead_payment_attempts_tenant_lead').on(table.tenantId, table.leadId),
    index('idx_lead_payment_attempts_tenant_lead_method_status').on(
      table.tenantId,
      table.leadId,
      table.method,
      table.status
    ),
  ]
);

export const memberLeadsRelations = relations(memberLeads, ({ many }) => ({
  leadPaymentAttempts: many(leadPaymentAttempts),
}));

export const leadPaymentAttemptsRelations = relations(leadPaymentAttempts, ({ one }) => ({
  lead: one(memberLeads, {
    fields: [leadPaymentAttempts.leadId],
    references: [memberLeads.id],
  }),
}));
