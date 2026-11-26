import { sql } from 'drizzle-orm';
import { check, foreignKey, pgPolicy, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { user } from './auth';

export const sponsorExitEvents = pgTable(
  'sponsor_exit_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    contractYearId: text('contract_year_id').notNull(),
    agreementKey: text('agreement_key').notNull(),
    operationId: text('operation_id').notNull(),
    kind: text('kind').notNull(),
    employeeSeatId: text('employee_seat_id'),
    recordedBy: text('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    effectiveAt: timestamp('effective_at', { withTimezone: true, mode: 'string' }).notNull(),
    evidenceRef: text('evidence_ref').notNull(),
  },
  table => [
    unique('sponsor_exit_events_operation_uq').on(table.tenantId, table.operationId),
    unique('sponsor_exit_events_scope_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.contractYearId,
      table.id,
      table.kind
    ),
    unique('sponsor_exit_events_employee_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.contractYearId,
      table.id,
      table.employeeSeatId
    ),
    foreignKey({
      name: 'sponsor_exit_events_actor_fk',
      columns: [table.tenantId, table.recordedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'sponsor_exit_events_target_ck',
      sql`(${table.kind} = 'agreement_termination' and ${table.employeeSeatId} is null)
        or (${table.kind} = 'employee_departure' and ${table.employeeSeatId} is not null)`
    ),
    check(
      'sponsor_exit_events_evidence_ck',
      sql`${table.operationId} ~ '[^[:space:]]' and ${table.evidenceRef} ~ '[^[:space:]]'
        and isfinite(${table.recordedAt}) and isfinite(${table.effectiveAt})`
    ),
    pgPolicy('sponsor_exit_events_access', {
      for: 'all',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and nullif((select current_setting('app.current_actor_id', true)), '') is not null`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and ${table.recordedBy} = nullif((select current_setting('app.current_actor_id', true)), '')`,
    }),
  ]
).enableRLS();
