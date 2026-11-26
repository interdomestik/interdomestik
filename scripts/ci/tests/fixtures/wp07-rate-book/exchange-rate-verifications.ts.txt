import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { exchangeRateCheckEvents } from './exchange-rate-checks';
import { exchangeRates } from './exchange-rates';
import { sponsorTenantPolicy } from './sponsors';
import { legalEntities } from './tenant-entity-decomposition';
import { tenants } from './tenants';

export const exchangeRateVerifications = pgTable(
  'exchange_rate_verifications',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    bookId: text('book_id').notNull(),
    rateId: text('rate_id').notNull(),
    checkId: text('check_id'),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    rateEffectiveOn: date('rate_effective_on').notNull(),
    observedRate: numeric('observed_rate').notNull(),
    sourceRef: text('source_ref').notNull(),
    verifiedBy: text('verified_by').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'string' }).notNull(),
    operationKey: uuid('operation_key').notNull(),
  },
  table => [
    unique('exchange_rate_verifications_operation_uq').on(table.tenantId, table.operationKey),
    unique('exchange_rate_verifications_check_uq').on(table.tenantId, table.bookId, table.checkId),
    foreignKey({
      name: 'exchange_rate_verifications_check_fk',
      columns: [
        table.tenantId,
        table.bookId,
        table.checkId,
        table.legalEntityId,
        table.verifiedBy,
        table.rateId,
      ],
      foreignColumns: [
        exchangeRateCheckEvents.tenantId,
        exchangeRateCheckEvents.bookId,
        exchangeRateCheckEvents.id,
        exchangeRateCheckEvents.legalEntityId,
        exchangeRateCheckEvents.actorId,
        exchangeRateCheckEvents.rateId,
      ],
    }),
    index('exchange_rate_verifications_latest_idx').on(
      table.tenantId,
      table.bookId,
      table.rateId,
      table.verifiedAt
    ),
    foreignKey({
      name: 'exchange_rate_verifications_exact_rate_fk',
      columns: [
        table.tenantId,
        table.rateId,
        table.bookId,
        table.base,
        table.quote,
        table.observedRate,
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
      name: 'exchange_rate_verifications_entity_fk',
      columns: [table.tenantId, table.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      name: 'exchange_rate_verifications_actor_fk',
      columns: [table.tenantId, table.verifiedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'exchange_rate_verifications_pair_check',
      sql`${table.base} = 'EUR' and ${table.quote} = 'MKD'`
    ),
    check(
      'exchange_rate_verifications_finite_stamps',
      sql`isfinite(${table.rateEffectiveOn}) and isfinite(${table.verifiedAt})`
    ),
    check(
      'exchange_rate_verifications_observed_rate_check',
      sql`${table.observedRate} > 0 and ${table.observedRate} <= 9999999999.99999999 and scale(${table.observedRate}) <= 8`
    ),
    check(
      'exchange_rate_verifications_source_ref_check',
      sql`${table.sourceRef} collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'`
    ),
    sponsorTenantPolicy('exchange_rate_verifications_tenant_policy', table.tenantId),
  ]
).enableRLS();

export const exchangeRateVerificationLimits = pgTable(
  'exchange_rate_verification_limits',
  {
    tenantId: text('tenant_id')
      .primaryKey()
      .references(() => tenants.id),
    maxAgeSeconds: integer('max_age_seconds').notNull(),
  },
  table => [
    check(
      'exchange_rate_verification_limits_max_age_check',
      sql`${table.maxAgeSeconds} >= 1 and ${table.maxAgeSeconds} <= 2678400`
    ),
    sponsorTenantPolicy('exchange_rate_verification_limits_tenant_policy', table.tenantId),
  ]
).enableRLS();
