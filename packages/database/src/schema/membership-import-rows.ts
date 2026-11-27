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
      // Until the review-fact allow-list is approved (O3), only the empty object is stored.
      sql`${table.sourceRow} > 0 and ${table.reviewFacts} = '{}'::jsonb`
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
          (${table.evidenceClass} ~ '^[a-z][a-z0-9_-]{0,63}$' and ${table.evidenceRef} ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))
        and (${table.sourcePaidThrough} is null or isfinite(${table.sourcePaidThrough}))
        and (${table.origin} = 'new_company'
          or (${table.evidenceRef} is not null and ${table.sourcePaidThrough} is not null))`
    ),
    check(
      'membership_import_rows_fulfillment_ck',
      sql`${table.fulfillmentState} in ('pending', 'fulfilled', 'rejected', 'withdrawn', 'expired')
        and (${table.fulfillmentState} = 'fulfilled') = (${table.periodOriginRef} is not null)
        and (${table.periodOriginRef} is null or ${table.periodOriginRef} ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
        and (${table.identityReleasedAt} is null
          or (${table.fulfillmentState} <> 'pending' and isfinite(${table.identityReleasedAt})))`
    ),
    pgPolicy('membership_import_rows_select', {
      for: 'select',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and exists (
          select 1 from public.membership_import_lists as import_list
          where import_list.tenant_id = ${table.tenantId}
            and import_list.legal_entity_id = ${table.legalEntityId}
            and import_list.id = ${table.listId}
        )`,
    }),
    // Only the submitter adds rows, to a pending list, at a position within its row count.
    // With unique positions, a complete list (the decision trigger's condition) admits no row.
    pgPolicy('membership_import_rows_insert', {
      for: 'insert',
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and ${table.fulfillmentState} = 'pending'
        and exists (
          select 1 from public.membership_import_lists as import_list
          where import_list.tenant_id = ${table.tenantId}
            and import_list.legal_entity_id = ${table.legalEntityId}
            and import_list.id = ${table.listId}
            and import_list.decision is null
            and import_list.submitted_by = (select current_setting('app.current_actor_id', true))
            and ${table.sourceRow} <= import_list.row_count
        )`,
    }),
  ]
).enableRLS();
