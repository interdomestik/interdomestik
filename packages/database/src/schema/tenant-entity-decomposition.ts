import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  pgView,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { tenants } from './tenants';

export const legalEntities = pgTable(
  'legal_entities',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    legalName: text('legal_name').notNull(),
    countryCode: text('country_code').notNull(),
    governingLaw: text('governing_law'),
    termsVersion: text('terms_version'),
    currency: text('currency').default('EUR').notNull(),
    taxId: text('tax_id'),
    address: jsonb('address').$type<Record<string, unknown>>(),
    contact: jsonb('contact').$type<Record<string, unknown>>(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('legal_entities_tenant_idx').on(table.tenantId),
    check('legal_entities_country_code_check', sql`${table.countryCode} ~ '^[A-Z]{2}$'`),
    check(
      'legal_entities_governing_law_check',
      sql`${table.governingLaw} IS NULL OR ${table.governingLaw} ~ '^[A-Z]{2}$'`
    ),
  ]
);

export const marketingHosts = pgTable(
  'marketing_hosts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    label: text('label').notNull(),
    host: text('host').notNull(),
    isPrimary: boolean('is_primary').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    index('marketing_hosts_tenant_idx').on(table.tenantId),
    uniqueIndex('marketing_hosts_host_uq').on(table.host),
    uniqueIndex('marketing_hosts_primary_tenant_uq')
      .on(table.tenantId)
      .where(sql`${table.isPrimary} = true`),
    check(
      'marketing_hosts_host_normalized_check',
      sql`${table.host} = lower(${table.host})
        and position('/' in ${table.host}) = 0
        and position(':' in ${table.host}) = 0
        and ${table.host} = btrim(${table.host})
        and length(${table.host}) > 0`
    ),
  ]
);

export const defaultBookingLinks = pgTable(
  'default_booking_links',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    marketingHostId: text('marketing_host_id').notNull(),
    defaultBookingTenantId: text('default_booking_tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    uniqueIndex('default_booking_links_tenant_uq').on(table.tenantId),
    uniqueIndex('default_booking_links_marketing_host_uq').on(table.marketingHostId),
    index('default_booking_links_booking_tenant_idx').on(table.defaultBookingTenantId),
    index('default_booking_links_legal_entity_idx').on(table.legalEntityId),
    foreignKey({
      columns: [table.marketingHostId],
      foreignColumns: [marketingHosts.id],
      name: 'default_booking_links_marketing_host_id_fk',
    }),
    foreignKey({
      columns: [table.defaultBookingTenantId],
      foreignColumns: [tenants.id],
      name: 'default_booking_links_default_booking_tenant_id_fk',
    }),
    foreignKey({
      columns: [table.legalEntityId],
      foreignColumns: [legalEntities.id],
      name: 'default_booking_links_legal_entity_id_fk',
    }),
  ]
);

export const tenantEntityBoundaries = pgView('tenant_entity_boundaries', {
  homeTenantId: text('home_tenant_id'),
  legalEntityId: text('legal_entity_id'),
  marketingHostId: text('marketing_host_id'),
  defaultBookingLinkId: text('default_booking_link_id'),
  defaultBookingTenantId: text('default_booking_tenant_id'),
  tenantName: text('tenant_name'),
  legalName: text('legal_name'),
  governingLaw: text('governing_law'),
  termsVersion: text('terms_version'),
  marketingHost: text('marketing_host'),
  marketingHostLabel: text('marketing_host_label'),
}).existing();
