import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  customType,
  date,
  foreignKey,
  integer,
  pgPolicy,
  pgTable,
  primaryKey,
  numeric,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { membershipTierEnum } from './enums';
import { exchangeRates } from './exchange-rates';
import { memberLeads } from './leads';
import { membershipPlanVersions } from './membership-plan-versions';
import { branches } from './rbac';
import { sponsorTenantPolicy } from './sponsors';
import { tenants } from './tenants';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

function saleLookupPolicy(name: string) {
  return pgPolicy(name, {
    for: 'select',
    to: 'public',
    using: sql`nullif(btrim(current_setting('app.current_access_tenant_id', true)), '') is not null`,
  });
}

export const membershipSaleKinds = pgTable(
  'membership_sale_kinds',
  { kind: text('kind').primaryKey() },
  () => [saleLookupPolicy('membership_sale_kinds_read_policy')]
).enableRLS();

export const membershipSaleChannels = pgTable(
  'membership_sale_channels',
  {
    kind: text('kind')
      .notNull()
      .references(() => membershipSaleKinds.kind),
    channel: text('channel').notNull(),
  },
  table => [
    primaryKey({ name: 'membership_sale_channels_pk', columns: [table.kind, table.channel] }),
    saleLookupPolicy('membership_sale_channels_read_policy'),
  ]
).enableRLS();

export const membershipSaleClaims = pgTable(
  'membership_sale_claims',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    operationKey: text('operation_key').notNull(),
    requestHash: bytea('request_hash').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  table => [
    primaryKey({
      name: 'membership_sale_claims_pk',
      columns: [table.tenantId, table.operationKey],
    }),
    unique('membership_sale_claims_hash_uq').on(
      table.tenantId,
      table.operationKey,
      table.requestHash
    ),
    check('membership_sale_claims_hash_check', sql`octet_length(${table.requestHash}) = 32`),
    sponsorTenantPolicy('membership_sale_claims_tenant_policy', table.tenantId),
  ]
).enableRLS();

export const membershipSales = pgTable(
  'membership_sales',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    kind: text('kind')
      .notNull()
      .references(() => membershipSaleKinds.kind),
    planVersionId: text('plan_version_id').notNull(),
    planId: text('plan_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    priceCurrency: text('price_currency').notNull(),
    priceMinor: bigint('price_minor', { mode: 'bigint' }).notNull(),
    governingLaw: text('governing_law').notNull(),
    termsVersion: text('terms_version').notNull(),
    rateId: text('rate_id').notNull(),
    rateBookId: text('rate_book_id').notNull(),
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    rateBase: text('rate_base').notNull(),
    rateQuote: text('rate_quote').notNull(),
    rateEffectiveOn: date('rate_effective_on').notNull(),
    amountMkdMinor: bigint('amount_mkd_minor', { mode: 'bigint' }).notNull(),
    channel: text('channel').notNull(),
    soldBy: text('sold_by').notNull(),
    soldAt: timestamp('sold_at', { withTimezone: true, mode: 'string' }).notNull(),
    soldOn: date('sold_on').notNull(),
    dueOn: date('due_on').notNull(),
    operationKey: text('operation_key').notNull(),
    requestHash: bytea('request_hash').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'string' }),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    buyerKind: text('buyer_kind', { enum: ['lead', 'member'] }),
    leadId: text('lead_id'),
    memberUserId: text('member_user_id'),
    listPriceMinor: bigint('list_price_minor', { mode: 'bigint' }),
    planTier: membershipTierEnum('plan_tier'),
    planMembersIncluded: integer('plan_members_included'),
    agentId: text('agent_id'),
    branchId: text('branch_id'),
  },
  table => [
    unique('membership_sales_charge_uq').on(table.tenantId, table.id, table.amountMkdMinor),
    unique('membership_sales_operation_uq').on(table.tenantId, table.operationKey),
    uniqueIndex('membership_sales_live_lead_uq')
      .on(table.tenantId, table.leadId)
      .where(sql`lead_id is not null and voided_at is null`),
    foreignKey({
      name: 'membership_sales_channel_fk',
      columns: [table.kind, table.channel],
      foreignColumns: [membershipSaleChannels.kind, membershipSaleChannels.channel],
    }),
    foreignKey({
      name: 'membership_sales_claim_fk',
      columns: [table.tenantId, table.operationKey, table.requestHash],
      foreignColumns: [
        membershipSaleClaims.tenantId,
        membershipSaleClaims.operationKey,
        membershipSaleClaims.requestHash,
      ],
    }),
    foreignKey({
      name: 'membership_sales_rate_fk',
      columns: [
        table.tenantId,
        table.rateId,
        table.rateBookId,
        table.rateBase,
        table.rateQuote,
        table.rate,
        table.rateEffectiveOn,
      ],
      foreignColumns: [
        exchangeRates.tenantId,
        exchangeRates.id,
        exchangeRates.bookId,
        exchangeRates.base,
        exchangeRates.quote,
        exchangeRates.rate,
        exchangeRates.effectiveOn,
      ],
    }),
    foreignKey({
      name: 'membership_sales_offer_fk',
      columns: [
        table.tenantId,
        table.planVersionId,
        table.planId,
        table.legalEntityId,
        table.listPriceMinor,
        table.priceCurrency,
        table.planTier,
        table.planMembersIncluded,
      ],
      foreignColumns: [
        membershipPlanVersions.tenantId,
        membershipPlanVersions.id,
        membershipPlanVersions.planId,
        membershipPlanVersions.legalEntityId,
        membershipPlanVersions.listPriceMinor,
        membershipPlanVersions.priceCurrency,
        membershipPlanVersions.tier,
        membershipPlanVersions.membersIncluded,
      ],
    }),
    foreignKey({
      name: 'membership_sales_lead_fk',
      columns: [table.tenantId, table.leadId],
      foreignColumns: [memberLeads.tenantId, memberLeads.id],
    }),
    foreignKey({
      name: 'membership_sales_member_fk',
      columns: [table.tenantId, table.memberUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_sales_seller_fk',
      columns: [table.tenantId, table.soldBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_sales_agent_fk',
      columns: [table.tenantId, table.agentId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_sales_void_actor_fk',
      columns: [table.tenantId, table.voidedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_sales_branch_fk',
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    // Multiplication by 0.01 is exact even where numeric division would round its result.
    check(
      'membership_sales_conversion_check',
      sql`
      ${table.amountMkdMinor} = round(${table.priceMinor}::numeric * ${table.rate} * 0.01) * 100`
    ),
    check(
      'membership_sales_positive_check',
      sql`${table.priceMinor} > 0 and ${table.amountMkdMinor} > 0`
    ),
    check(
      'membership_sales_individual_buyer_check',
      sql`
      ${table.kind} <> 'individual' or (${table.buyerKind} is not null and (
        (${table.buyerKind} = 'lead' and ${table.leadId} is not null and ${table.memberUserId} is null)
        or (${table.buyerKind} = 'member' and ${table.memberUserId} is not null and ${table.leadId} is null)
      ))`
    ),
    check(
      'membership_sales_individual_offer_check',
      sql`
      ${table.kind} <> 'individual' or (
        ${table.listPriceMinor} is not null and ${table.priceMinor} = ${table.listPriceMinor}
        and ${table.dueOn} = ${table.soldOn} and ${table.planTier} is not null
        and ${table.planTier} in ('basic', 'standard')
        and ${table.planMembersIncluded} is not null and ${table.planMembersIncluded} = 1
      )`
    ),
    sponsorTenantPolicy('membership_sales_tenant_policy', table.tenantId),
  ]
).enableRLS();

export const membershipLedgerEntries = pgTable(
  'membership_ledger_entries',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    saleId: text('sale_id').notNull(),
    kind: text('kind').notNull(),
    amountMkdMinor: bigint('amount_mkd_minor', { mode: 'bigint' }).notNull(),
  },
  table => [
    foreignKey({
      name: 'membership_ledger_entries_amount_fk',
      columns: [table.tenantId, table.saleId, table.amountMkdMinor],
      foreignColumns: [
        membershipSales.tenantId,
        membershipSales.id,
        membershipSales.amountMkdMinor,
      ],
    }),
    check('membership_ledger_entries_kind_check', sql`${table.kind} = 'charge'`),
    uniqueIndex('membership_ledger_entries_charge_uq')
      .on(table.tenantId, table.saleId)
      .where(sql`kind = 'charge'`),
    sponsorTenantPolicy('membership_ledger_entries_tenant_policy', table.tenantId),
  ]
).enableRLS();
