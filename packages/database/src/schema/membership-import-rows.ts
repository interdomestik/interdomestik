import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

export const membershipImportRows = pgTable(
  'membership_import_rows',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    listId: text('list_id').notNull(),
    contractYearId: text('contract_year_id'),
    origin: text('origin').notNull(),
    sourceRow: integer('source_row').notNull(),
    reviewFacts: jsonb('review_facts').notNull().default({}),
    stableIdentityNamespace: text('stable_identity_namespace'),
    stableIdentityKey: text('stable_identity_key'),
    emailAliasKey: text('email_alias_key'),
    memberUserId: text('member_user_id'),
    memberVerifiedAt: timestamp('member_verified_at', { withTimezone: true, mode: 'string' }),
    evidenceClass: text('evidence_class'),
    evidenceRef: text('evidence_ref'),
    sourcePaidThrough: date('source_paid_through'),
    fulfillmentState: text('fulfillment_state').notNull().default('pending'),
    periodOriginRef: text('period_origin_ref'),
    identityReleasedAt: timestamp('identity_released_at', { withTimezone: true, mode: 'string' }),
  },
  table => [
    unique('membership_import_rows_scope_uq').on(table.tenantId, table.legalEntityId, table.id),
    unique('membership_import_rows_year_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.contractYearId,
      table.id
    ),
    unique('membership_import_rows_position_uq').on(table.tenantId, table.listId, table.sourceRow),
    foreignKey({
      name: 'membership_import_rows_member_fk',
      columns: [table.tenantId, table.memberUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'membership_import_rows_origin_ck',
      sql`(${table.origin} = 'prior_paid_individual' and ${table.contractYearId} is null)
        or (${table.origin} in ('prior_paid_company', 'new_company') and ${table.contractYearId} is not null)`
    ),
    check(
      'membership_import_rows_review_ck',
      sql`${table.sourceRow} > 0 and jsonb_typeof(${table.reviewFacts}) = 'object'`
    ),
    check(
      'membership_import_rows_identity_ck',
      sql`num_nonnulls(${table.stableIdentityKey}, ${table.emailAliasKey}, ${table.memberUserId}) >= 1
        and (${table.stableIdentityKey} is null) = (${table.stableIdentityNamespace} is null)
        and (${table.stableIdentityKey} is null or
          (${table.stableIdentityNamespace} ~ '[^[:space:]]' and ${table.stableIdentityKey} ~ '^[0-9a-f]{64}$'))
        and (${table.emailAliasKey} is null or ${table.emailAliasKey} ~ '^[0-9a-f]{64}$')
        and (${table.memberUserId} is null) = (${table.memberVerifiedAt} is null)
        and (${table.memberVerifiedAt} is null or isfinite(${table.memberVerifiedAt}))`
    ),
    check(
      'membership_import_rows_proof_ck',
      sql`(${table.evidenceClass} is null) = (${table.evidenceRef} is null)
        and (${table.evidenceRef} is null or
          (${table.evidenceClass} ~ '[^[:space:]]' and ${table.evidenceRef} ~ '[^[:space:]]'))
        and (${table.sourcePaidThrough} is null or isfinite(${table.sourcePaidThrough}))
        and (${table.origin} = 'new_company'
          or (${table.evidenceRef} is not null and ${table.sourcePaidThrough} is not null))`
    ),
    check(
      'membership_import_rows_fulfillment_ck',
      sql`${table.fulfillmentState} in ('pending', 'fulfilled', 'rejected', 'withdrawn', 'expired')
        and (${table.fulfillmentState} = 'fulfilled') = (${table.periodOriginRef} is not null)
        and (${table.periodOriginRef} is null or ${table.periodOriginRef} ~ '[^[:space:]]')
        and (${table.identityReleasedAt} is null
          or (${table.fulfillmentState} <> 'pending' and isfinite(${table.identityReleasedAt})))`
    ),
    pgPolicy('membership_import_rows_select', {
      for: 'select',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and exists (
          select 1 from public.membership_import_lists as import_list
          where import_list.tenant_id = ${table.tenantId}
            and import_list.legal_entity_id = ${table.legalEntityId}
            and import_list.id = ${table.listId}
        )`,
    }),
    pgPolicy('membership_import_rows_insert', {
      for: 'insert',
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and ${table.fulfillmentState} = 'pending'
        and exists (
          select 1 from public.membership_import_lists as import_list
          where import_list.tenant_id = ${table.tenantId}
            and import_list.legal_entity_id = ${table.legalEntityId}
            and import_list.id = ${table.listId}
            and import_list.decision is null
        )`,
    }),
  ]
).enableRLS();
