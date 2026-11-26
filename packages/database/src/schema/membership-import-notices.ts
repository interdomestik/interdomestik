import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

export const membershipNoticeObligations = pgTable(
  'membership_notice_obligations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    importRowId: text('import_row_id').notNull(),
    purpose: text('purpose').notNull(),
    obligationKey: text('obligation_key').notNull(),
    recipientRef: text('recipient_ref').notNull(),
    contractYearId: text('contract_year_id'),
    seatId: text('seat_id'),
    exitEventId: text('exit_event_id'),
    exitKind: text('exit_kind'),
    employeeExitSeatId: text('employee_exit_seat_id'),
    verifiedPaidEnd: timestamp('verified_paid_end', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  table => [
    unique('membership_notice_obligations_key_uq').on(table.tenantId, table.obligationKey),
    unique('membership_notice_obligations_token_subject_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.contractYearId,
      table.seatId,
      table.id,
      table.purpose
    ),
    check(
      'membership_notice_obligations_shape_ck',
      sql`(${table.seatId} is null) = (${table.contractYearId} is null)
        and (
          (${table.purpose} = 'individual_notice'
            and num_nonnulls(${table.exitEventId}, ${table.exitKind}, ${table.employeeExitSeatId}, ${table.verifiedPaidEnd}) = 0)
          or (${table.purpose} = 'employer_exit'
            and num_nonnulls(${table.seatId}, ${table.exitEventId}, ${table.exitKind}) = 3
            and ((${table.exitKind} = 'agreement_termination' and ${table.employeeExitSeatId} is null)
              or (${table.exitKind} = 'employee_departure' and ${table.employeeExitSeatId} is not null
                and ${table.employeeExitSeatId} = ${table.seatId})))
        )`
    ),
    check(
      'membership_notice_obligations_evidence_ck',
      sql`${table.obligationKey} ~ '[^[:space:]]' and ${table.recipientRef} ~ '[^[:space:]]'
        and isfinite(${table.createdAt})
        and (${table.verifiedPaidEnd} is null or isfinite(${table.verifiedPaidEnd}))`
    ),
    pgPolicy('membership_notice_obligations_access', {
      for: 'all',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and nullif((select current_setting('app.current_actor_id', true)), '') is not null`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and nullif((select current_setting('app.current_actor_id', true)), '') is not null`,
    }),
  ]
).enableRLS();

export const membershipOptOutTokens = pgTable(
  'membership_opt_out_tokens',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    contractYearId: text('contract_year_id').notNull(),
    seatId: text('seat_id').notNull(),
    noticeId: text('notice_id').notNull(),
    noticePurpose: text('notice_purpose').notNull().default('individual_notice'),
    formatVersion: integer('format_version').notNull(),
    derivationVersion: integer('derivation_version').notNull(),
    tokenHash: text('token_hash').notNull(),
    issuedBy: text('issued_by').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true, mode: 'string' }),
  },
  table => [
    unique('membership_opt_out_tokens_format_hash_uq').on(table.formatVersion, table.tokenHash),
    unique('membership_opt_out_tokens_notice_uq').on(table.tenantId, table.noticeId),
    foreignKey({
      name: 'membership_opt_out_tokens_notice_fk',
      columns: [
        table.tenantId,
        table.legalEntityId,
        table.contractYearId,
        table.seatId,
        table.noticeId,
        table.noticePurpose,
      ],
      foreignColumns: [
        membershipNoticeObligations.tenantId,
        membershipNoticeObligations.legalEntityId,
        membershipNoticeObligations.contractYearId,
        membershipNoticeObligations.seatId,
        membershipNoticeObligations.id,
        membershipNoticeObligations.purpose,
      ],
    }),
    foreignKey({
      name: 'membership_opt_out_tokens_issuer_fk',
      columns: [table.tenantId, table.issuedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'membership_opt_out_tokens_hash_ck',
      sql`${table.formatVersion} > 0 and ${table.derivationVersion} > 0
        and ${table.tokenHash} ~ '^[0-9a-f]{64}$' and ${table.noticePurpose} = 'individual_notice'`
    ),
    check(
      'membership_opt_out_tokens_time_ck',
      sql`isfinite(${table.issuedAt}) and (${table.invalidatedAt} is null
        or (isfinite(${table.invalidatedAt}) and ${table.invalidatedAt} >= ${table.issuedAt}))`
    ),
    pgPolicy('membership_opt_out_tokens_select', {
      for: 'select',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and nullif((select current_setting('app.current_actor_id', true)), '') is not null`,
    }),
    pgPolicy('membership_opt_out_tokens_issue', {
      for: 'insert',
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and ${table.issuedBy} = nullif((select current_setting('app.current_actor_id', true)), '')
        and ${table.invalidatedAt} is null`,
    }),
  ]
).enableRLS();
