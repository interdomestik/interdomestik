import { sql } from 'drizzle-orm';
import { check, integer, pgPolicy, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const sponsorContractYearSeats = pgTable(
  'sponsor_contract_year_seats',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    contractYearId: text('contract_year_id').notNull(),
    importRowId: text('import_row_id').notNull(),
    slot: integer('slot').notNull(),
    yearCurrentLimit: integer('year_current_limit').notNull(),
    reservedAt: timestamp('reserved_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  table => [
    unique('sponsor_contract_year_seats_slot_uq').on(
      table.tenantId,
      table.contractYearId,
      table.slot
    ),
    unique('sponsor_contract_year_seats_row_uq').on(table.tenantId, table.importRowId),
    unique('sponsor_contract_year_seats_scope_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.contractYearId,
      table.id
    ),
    unique('sponsor_contract_year_seats_subject_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.contractYearId,
      table.id,
      table.importRowId
    ),
    check(
      'sponsor_contract_year_seats_slot_ck',
      sql`${table.slot} between 1 and ${table.yearCurrentLimit} and isfinite(${table.reservedAt})`
    ),
    pgPolicy('sponsor_contract_year_seats_access', {
      for: 'all',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and exists (
          select 1 from public.membership_import_rows as import_row
          where import_row.tenant_id = ${table.tenantId}
            and import_row.legal_entity_id = ${table.legalEntityId}
            and import_row.id = ${table.importRowId}
        )`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and exists (
          select 1 from public.membership_import_rows as import_row
          where import_row.tenant_id = ${table.tenantId}
            and import_row.legal_entity_id = ${table.legalEntityId}
            and import_row.id = ${table.importRowId}
        )`,
    }),
  ]
).enableRLS();
