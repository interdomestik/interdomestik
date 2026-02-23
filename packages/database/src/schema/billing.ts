import { decimal, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { subscriptions } from './memberships';
import { tenants } from './tenants';
import { webhookEvents } from './webhooks';

const billingEntityValues = ['ks', 'mk', 'al'] as const;

export const billingInvoices = pgTable(
  'billing_invoices',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingEntity: text('billing_entity', { enum: billingEntityValues }).notNull(),
    provider: text('provider').notNull().default('paddle'),
    providerTransactionId: text('provider_transaction_id').notNull(),
    webhookEventId: text('webhook_event_id')
      .notNull()
      .references(() => webhookEvents.id),
    subscriptionId: text('subscription_id').references(() => subscriptions.id),
    eventId: text('event_id'),
    status: text('status').notNull().default('posted'),
    amountTotal: decimal('amount_total', { precision: 12, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('billing_invoices_scope_txn_uq').on(
      table.tenantId,
      table.billingEntity,
      table.providerTransactionId
    ),
    uniqueIndex('billing_invoices_webhook_event_uq').on(table.webhookEventId),
    index('billing_invoices_tenant_entity_idx').on(table.tenantId, table.billingEntity),
  ]
);

export const billingLedgerEntries = pgTable(
  'billing_ledger_entries',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    billingEntity: text('billing_entity', { enum: billingEntityValues }).notNull(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => billingInvoices.id),
    webhookEventId: text('webhook_event_id')
      .notNull()
      .references(() => webhookEvents.id),
    provider: text('provider').notNull().default('paddle'),
    providerTransactionId: text('provider_transaction_id').notNull(),
    entryType: text('entry_type').notNull(),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    currencyCode: text('currency_code').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('billing_ledger_scope_txn_entry_uq').on(
      table.tenantId,
      table.billingEntity,
      table.providerTransactionId,
      table.entryType
    ),
    uniqueIndex('billing_ledger_webhook_event_uq').on(table.webhookEventId),
    index('billing_ledger_invoice_idx').on(table.invoiceId),
  ]
);
