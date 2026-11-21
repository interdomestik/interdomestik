import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { membershipTierEnum } from './enums';
import { membershipPlans } from './membership-plans';
import { sponsorTenantPolicy } from './sponsors';
import { legalEntities } from './tenant-entity-decomposition';

export const membershipPlanVersions = pgTable(
  'membership_plan_versions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    planId: text('plan_id').notNull(),
    version: integer('version').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    tier: membershipTierEnum('tier').notNull(),
    interval: text('interval').notNull(),
    membersIncluded: integer('members_included').notNull(),
    listPriceMinor: bigint('list_price_minor', { mode: 'bigint' }).notNull(),
    priceCurrency: text('price_currency').notNull(),
    publishedBy: text('published_by').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }).notNull(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true, mode: 'string' }),
    withdrawnBy: text('withdrawn_by'),
  },
  table => [
    unique('membership_plan_versions_number_uq').on(table.tenantId, table.planId, table.version),
    unique('membership_plan_versions_sale_snapshot_uq').on(
      table.tenantId,
      table.id,
      table.planId,
      table.legalEntityId,
      table.listPriceMinor,
      table.priceCurrency,
      table.tier,
      table.membersIncluded
    ),
    foreignKey({
      name: 'membership_plan_versions_plan_fk',
      columns: [table.tenantId, table.planId],
      foreignColumns: [membershipPlans.tenantId, membershipPlans.id],
    }),
    foreignKey({
      name: 'membership_plan_versions_entity_fk',
      columns: [table.tenantId, table.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      name: 'membership_plan_versions_publisher_fk',
      columns: [table.tenantId, table.publishedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_plan_versions_withdrawer_fk',
      columns: [table.tenantId, table.withdrawnBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'membership_plan_versions_terms_check',
      sql`
      ${table.tier} <> 'family' and ${table.interval} = 'year'
      and ${table.priceCurrency} = 'EUR' and ${table.listPriceMinor} > 0`
    ),
    sponsorTenantPolicy('membership_plan_versions_tenant_policy', table.tenantId),
  ]
).enableRLS();
