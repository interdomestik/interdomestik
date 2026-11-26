import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { exchangeRateBooks, exchangeRates } from './exchange-rates';
import { sponsorTenantPolicy } from './sponsors';
import { legalEntities } from './tenant-entity-decomposition';

export const exchangeRateCheckWindows = pgTable(
  'exchange_rate_check_windows',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    bookId: text('book_id').notNull(),
    base: text('base').notNull().default('EUR'),
    quote: text('quote').notNull().default('MKD'),
    effectiveOn: date('effective_on').notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true, mode: 'string' }).notNull(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true, mode: 'string' }).notNull(),
    approvalRef: text('approval_ref').notNull(),
  },
  table => [
    unique('exchange_rate_check_windows_scope_uq').on(table.tenantId, table.bookId, table.id),
    index('exchange_rate_check_windows_open_idx').on(table.tenantId, table.bookId, table.opensAt),
    foreignKey({
      name: 'exchange_rate_check_windows_book_fk',
      columns: [table.tenantId, table.bookId, table.base, table.quote],
      foreignColumns: [
        exchangeRateBooks.tenantId,
        exchangeRateBooks.id,
        exchangeRateBooks.base,
        exchangeRateBooks.quote,
      ],
    }),
    check(
      'exchange_rate_check_windows_bounds',
      sql`isfinite(${table.opensAt}) and isfinite(${table.deadlineAt})
        and ${table.opensAt} < ${table.deadlineAt}
        and ${table.effectiveOn} = (${table.opensAt} at time zone 'Europe/Skopje')::date`
    ),
    check(
      'exchange_rate_check_windows_approval_ref',
      sql`${table.approvalRef} collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'`
    ),
    sponsorTenantPolicy('exchange_rate_check_windows_tenant_policy', table.tenantId),
  ]
).enableRLS();

export const exchangeRateCheckEvents = pgTable(
  'exchange_rate_check_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    bookId: text('book_id').notNull(),
    windowId: text('window_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    actorId: text('actor_id').notNull(),
    rateId: text('rate_id'),
    rateEffectiveOn: date('rate_effective_on'),
    kind: text('kind', { enum: ['start', 'mismatch', 'inconclusive'] }).notNull(),
    checkId: text('check_id'),
    startOrder: bigint('start_order', { mode: 'bigint' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    operationKey: uuid('operation_key').notNull(),
    observedRate: numeric('observed_rate'),
    sourceRef: text('source_ref'),
    reason: text('reason'),
  },
  table => [
    unique('exchange_rate_check_events_operation_uq').on(table.tenantId, table.operationKey),
    unique('exchange_rate_check_events_order_uq').on(
      table.tenantId,
      table.bookId,
      table.startOrder
    ),
    unique('exchange_rate_check_events_terminal_uq').on(
      table.tenantId,
      table.bookId,
      table.checkId
    ),
    unique('exchange_rate_check_events_window_scope_uq').on(
      table.tenantId,
      table.bookId,
      table.windowId,
      table.id
    ),
    unique('exchange_rate_check_events_attestation_uq').on(
      table.tenantId,
      table.bookId,
      table.id,
      table.legalEntityId,
      table.actorId,
      table.rateId
    ),
    index('exchange_rate_check_events_dispute_idx')
      .on(table.tenantId, table.bookId, table.rateId, table.occurredAt)
      .where(sql`${table.kind} = 'mismatch'`),
    foreignKey({
      name: 'exchange_rate_check_events_window_fk',
      columns: [table.tenantId, table.bookId, table.windowId],
      foreignColumns: [
        exchangeRateCheckWindows.tenantId,
        exchangeRateCheckWindows.bookId,
        exchangeRateCheckWindows.id,
      ],
    }),
    foreignKey({
      name: 'exchange_rate_check_events_start_fk',
      columns: [table.tenantId, table.bookId, table.windowId, table.checkId],
      foreignColumns: [table.tenantId, table.bookId, table.windowId, table.id],
    }),
    foreignKey({
      name: 'exchange_rate_check_events_actor_fk',
      columns: [table.tenantId, table.actorId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'exchange_rate_check_events_entity_fk',
      columns: [table.tenantId, table.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      name: 'exchange_rate_check_events_rate_fk',
      columns: [table.tenantId, table.rateId, table.bookId, table.rateEffectiveOn],
      foreignColumns: [
        exchangeRates.tenantId,
        exchangeRates.id,
        exchangeRates.bookId,
        exchangeRates.effectiveOn,
      ],
    }),
    check(
      'exchange_rate_check_events_shape',
      sql`isfinite(${table.occurredAt})
        and (${table.rateId} is null) = (${table.rateEffectiveOn} is null)
        and (
          (${table.kind} = 'start' and ${table.checkId} is null and ${table.startOrder} is not null
            and ${table.observedRate} is null and ${table.sourceRef} is null and ${table.reason} is null)
          or (${table.kind} = 'mismatch' and ${table.checkId} is not null and ${table.startOrder} is null
            and ${table.rateId} is not null and ${table.observedRate} is not null
            and ${table.sourceRef} is not null and ${table.reason} is null)
          or (${table.kind} = 'inconclusive' and ${table.checkId} is not null and ${table.startOrder} is null
            and ${table.observedRate} is null and ${table.sourceRef} is null and ${table.reason} is not null)
        )`
    ),
    check(
      'exchange_rate_check_events_mismatch_evidence',
      sql`${table.observedRate} > 0 and ${table.observedRate} <= 9999999999.99999999
        and scale(${table.observedRate}) <= 8
        and ${table.sourceRef} collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'`
    ),
    check(
      'exchange_rate_check_events_reason',
      sql`char_length(${table.reason}) <= 256 and ${table.reason} ~ '\\S'`
    ),
    sponsorTenantPolicy('exchange_rate_check_events_tenant_policy', table.tenantId),
  ]
).enableRLS();
