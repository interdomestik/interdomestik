import { sql } from 'drizzle-orm';
import { boolean, check, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const tenants = pgTable(
  'tenants',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    legalName: text('legal_name').notNull(),
    code: text('code').unique(), // Short tenant code derived from id (e.g. MK, KS). Unique, backfilled via migration 0078.
    countryCode: text('country_code').notNull(),
    governingLaw: text('governing_law'),
    termsVersion: text('terms_version'),
    currency: text('currency').default('EUR').notNull(),
    taxId: text('tax_id'),
    address: jsonb('address').$type<Record<string, unknown>>(),
    contact: jsonb('contact').$type<Record<string, unknown>>(),
    branding: jsonb('branding').$type<Record<string, unknown>>(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    check(
      'tenants_governing_law_check',
      sql`${table.governingLaw} IS NULL OR ${table.governingLaw} ~ '^[A-Z]{2}$'`
    ),
  ]
);

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    category: text('category').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [
    uniqueIndex('tenant_settings_tenant_category_key_uq').on(
      table.tenantId,
      table.category,
      table.key
    ),
  ]
);
