import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { sponsorTenantPolicy } from './sponsors';
import { tenants } from './tenants';

export const exchangeRateBooks = pgTable(
  'exchange_rate_books',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
  },
  table => [
    unique('exchange_rate_books_tenant_pair_uq').on(table.tenantId, table.base, table.quote),
    unique('exchange_rate_books_tenant_id_pair_uq').on(
      table.tenantId,
      table.id,
      table.base,
      table.quote
    ),
    check('exchange_rate_books_pair_check', sql`${table.base} = 'EUR' and ${table.quote} = 'MKD'`),
    sponsorTenantPolicy('exchange_rate_books_tenant_policy', table.tenantId),
  ]
).enableRLS();

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    bookId: text('book_id').notNull(),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    effectiveOn: date('effective_on').notNull(),
    weekStartsOn: date('week_starts_on').notNull(),
    revision: integer('revision').notNull(),
    correctsRateId: text('corrects_rate_id'),
    correctionReason: text('correction_reason'),
    source: text('source').notNull(),
    callerKind: text('caller_kind').notNull(),
    storedBy: text('stored_by'),
    storedAt: timestamp('stored_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  table => [
    unique('exchange_rates_tenant_book_week_revision_uq').on(
      table.tenantId,
      table.bookId,
      table.weekStartsOn,
      table.revision
    ),
    unique('exchange_rates_tenant_id_book_date_uq').on(
      table.tenantId,
      table.id,
      table.bookId,
      table.effectiveOn
    ),
    unique('exchange_rates_tenant_id_book_pair_rate_date_uq').on(
      table.tenantId,
      table.id,
      table.bookId,
      table.base,
      table.quote,
      table.rate,
      table.effectiveOn
    ),
    foreignKey({
      name: 'exchange_rates_book_fk',
      columns: [table.tenantId, table.bookId, table.base, table.quote],
      foreignColumns: [
        exchangeRateBooks.tenantId,
        exchangeRateBooks.id,
        exchangeRateBooks.base,
        exchangeRateBooks.quote,
      ],
    }),
    foreignKey({
      name: 'exchange_rates_correction_fk',
      columns: [table.tenantId, table.correctsRateId, table.bookId, table.effectiveOn],
      foreignColumns: [table.tenantId, table.id, table.bookId, table.effectiveOn],
    }),
    foreignKey({
      name: 'exchange_rates_stored_by_fk',
      columns: [table.tenantId, table.storedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'exchange_rates_positive_rate',
      sql`${table.rate} > 0 and ${table.rate} <> 'NaN'::numeric`
    ),
    check('exchange_rates_finite_effective_on', sql`isfinite(${table.effectiveOn})`),
    check(
      'exchange_rates_week_starts_on_iso_monday',
      sql`${table.weekStartsOn} = ${table.effectiveOn} - (extract(isodow from ${table.effectiveOn})::int - 1)`
    ),
    check('exchange_rates_source_check', sql`${table.source} = 'nbrm'`),
    check('exchange_rates_caller_kind_check', sql`${table.callerKind} in ('staff', 'inngest')`),
    check(
      'exchange_rates_revision_check',
      sql`${table.revision} >= 1 and (${table.revision} = 1) = (${table.correctsRateId} is null)`
    ),
    check(
      'exchange_rates_correction_reason_check',
      sql`(${table.revision} = 1 and ${table.correctionReason} is null) or (${table.revision} > 1 and ${table.callerKind} = 'staff' and ${table.correctionReason} is not null and ${table.correctionReason} ~ '\\S')`
    ),
    check(
      'exchange_rates_stored_by_check',
      sql`(${table.callerKind} = 'staff') = (${table.storedBy} is not null)`
    ),
    sponsorTenantPolicy('exchange_rates_tenant_policy', table.tenantId),
  ]
).enableRLS();
