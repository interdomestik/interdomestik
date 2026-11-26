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
import { sponsorTerms } from './sponsors';

export const sponsorContractYears = pgTable(
  'sponsor_contract_years',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    sponsorId: text('sponsor_id').notNull(),
    termId: text('term_id').notNull(),
    agreementKey: text('agreement_key').notNull(),
    startsOn: date('starts_on').notNull(),
    endsBefore: date('ends_before').notNull(),
    feeModel: text('fee_model').notNull(),
    feeMinor: integer('fee_minor').notNull(),
    currency: text('currency').notNull(),
    benefits: jsonb('benefits').notNull(),
    signedCeiling: integer('signed_ceiling').notNull(),
    currentLimit: integer('current_limit').notNull(),
    signedEvidenceRef: text('signed_evidence_ref').notNull(),
    verifiedBy: text('verified_by').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  table => [
    unique('sponsor_contract_years_term_uq').on(table.tenantId, table.termId),
    unique('sponsor_contract_years_scope_uq').on(table.tenantId, table.legalEntityId, table.id),
    unique('sponsor_contract_years_company_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.id,
      table.sponsorId,
      table.termId
    ),
    unique('sponsor_contract_years_agreement_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.id,
      table.agreementKey
    ),
    unique('sponsor_contract_years_limit_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.id,
      table.currentLimit
    ),
    foreignKey({
      name: 'sponsor_contract_years_term_fk',
      columns: [table.tenantId, table.termId, table.sponsorId, table.legalEntityId],
      foreignColumns: [
        sponsorTerms.tenantId,
        sponsorTerms.id,
        sponsorTerms.sponsorId,
        sponsorTerms.legalEntityId,
      ],
    }),
    foreignKey({
      name: 'sponsor_contract_years_verifier_fk',
      columns: [table.tenantId, table.verifiedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'sponsor_contract_years_limit_ck',
      sql`1 <= ${table.currentLimit} and ${table.currentLimit} <= ${table.signedCeiling}
        and ${table.signedCeiling} <= 500`
    ),
    check(
      'sponsor_contract_years_window_ck',
      sql`isfinite(${table.startsOn}) and isfinite(${table.endsBefore}) and ${table.startsOn} < ${table.endsBefore}`
    ),
    check(
      'sponsor_contract_years_fee_ck',
      sql`${table.feeModel} in ('fixed_fee', 'per_seat') and ${table.feeMinor} >= 0 and ${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      'sponsor_contract_years_evidence_ck',
      sql`${table.agreementKey} ~ '[^[:space:]]' and ${table.signedEvidenceRef} ~ '[^[:space:]]'
        and jsonb_typeof(${table.benefits}) = 'object' and isfinite(${table.verifiedAt})`
    ),
    pgPolicy('sponsor_contract_years_select', {
      for: 'select',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) in ('tenant_admin', 'staff')
        and nullif((select current_setting('app.current_actor_id', true)), '') is not null
        and ((select current_setting('app.current_actor_role', true)) = 'tenant_admin'
          or exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = ${table.tenantId}
              and assignment.legal_entity_id = ${table.legalEntityId}
              and assignment.sponsor_id = ${table.sponsorId}
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          ))`,
    }),
    pgPolicy('sponsor_contract_years_insert', {
      for: 'insert',
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and ${table.verifiedBy} = nullif((select current_setting('app.current_actor_id', true)), '')`,
    }),
    pgPolicy('sponsor_contract_years_limit_update', {
      for: 'update',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and nullif((select current_setting('app.current_actor_id', true)), '') is not null`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and nullif((select current_setting('app.current_actor_id', true)), '') is not null`,
    }),
  ]
).enableRLS();
