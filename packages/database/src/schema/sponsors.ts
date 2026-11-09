import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { memberLeads } from './leads';
import { membershipPlans } from './membership-plans';
import { branches } from './rbac';
import { legalEntities } from './tenant-entity-decomposition';
import { tenants } from './tenants';

/** ACQ-3b §3.2: one access-tenant policy per sponsor table (0083 pattern). */
export function sponsorTenantPolicy(name: string, tenantId: unknown) {
  const predicate = sql`${tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`;
  return pgPolicy(name, {
    as: 'permissive',
    for: 'all',
    to: 'public',
    using: predicate,
    withCheck: predicate,
  });
}

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/** A company that sponsors named employees (ACQ-3b §3.3). */
export const sponsors = pgTable(
  'sponsors',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    branchId: text('branch_id').notNull(),
    sourceLeadId: text('source_lead_id').notNull(),
    legalName: text('legal_name').notNull(),
    registrationNumber: text('registration_number'),
    taxNumber: text('tax_number'),
    billingContactName: text('billing_contact_name').notNull(),
    billingContactEmail: text('billing_contact_email').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: at('created_at').defaultNow().notNull(),
    updatedAt: at('updated_at').defaultNow().notNull(),
  },
  table => [
    unique('sponsors_tenant_id_id_uq').on(table.tenantId, table.id),
    uniqueIndex('sponsors_tenant_source_lead_uq').on(table.tenantId, table.sourceLeadId),
    foreignKey({
      name: 'sponsors_branch_fk',
      columns: [table.tenantId, table.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    foreignKey({
      name: 'sponsors_source_lead_fk',
      columns: [table.tenantId, table.sourceLeadId, table.branchId],
      foreignColumns: [memberLeads.tenantId, memberLeads.id, memberLeads.branchId],
    }),
    foreignKey({
      name: 'sponsors_created_by_fk',
      columns: [table.tenantId, table.createdBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check('sponsors_legal_name_check', sql`btrim(${table.legalName}) <> ''`),
    sponsorTenantPolicy('sponsors_tenant_policy', table.tenantId),
  ]
).enableRLS();

/** One contract year for a sponsor; dates, plan and entity are fixed at creation. */
export const sponsorTerms = pgTable(
  'sponsor_terms',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    sponsorId: text('sponsor_id').notNull(),
    termStart: at('term_start').notNull(),
    termEnd: at('term_end').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    planKey: text('plan_key').notNull(),
    planId: text('plan_id').notNull(),
    terminatedEffectiveAt: at('terminated_effective_at'),
    terminatedBy: text('terminated_by'),
    terminatedAt: at('terminated_at'),
    createdBy: text('created_by').notNull(),
    createdAt: at('created_at').defaultNow().notNull(),
  },
  table => [
    unique('sponsor_terms_tenant_id_id_uq').on(table.tenantId, table.id),
    uniqueIndex('sponsor_terms_sponsor_start_uq').on(table.sponsorId, table.termStart),
    index('sponsor_terms_tenant_window_idx').on(table.tenantId, table.termStart, table.termEnd),
    foreignKey({
      name: 'sponsor_terms_sponsor_fk',
      columns: [table.tenantId, table.sponsorId],
      foreignColumns: [sponsors.tenantId, sponsors.id],
    }),
    foreignKey({
      name: 'sponsor_terms_legal_entity_fk',
      columns: [table.tenantId, table.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      name: 'sponsor_terms_plan_fk',
      columns: [table.tenantId, table.planKey],
      foreignColumns: [membershipPlans.tenantId, membershipPlans.id],
    }),
    foreignKey({
      name: 'sponsor_terms_created_by_fk',
      columns: [table.tenantId, table.createdBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'sponsor_terms_terminated_by_fk',
      columns: [table.tenantId, table.terminatedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check('sponsor_terms_window_check', sql`${table.termEnd} > ${table.termStart}`),
    check(
      'sponsor_terms_termination_check',
      sql`(${table.terminatedEffectiveAt} is null and ${table.terminatedBy} is null and ${table.terminatedAt} is null)
        or (${table.terminatedEffectiveAt} is not null and ${table.terminatedBy} is not null and ${table.terminatedAt} is not null
          and ${table.terminatedEffectiveAt} between ${table.termStart} and ${table.termEnd})`
    ),
    sponsorTenantPolicy('sponsor_terms_tenant_policy', table.tenantId),
  ]
).enableRLS();

/** Immutable seat-count and price revisions of a term. */
export const sponsorTermRevisions = pgTable(
  'sponsor_term_revisions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    termId: text('term_id').notNull(),
    revision: integer('revision').notNull(),
    seatCount: integer('seat_count').notNull(),
    pricePerSeatMinor: integer('price_per_seat_minor').notNull(),
    currency: text('currency').notNull(),
    contractReference: text('contract_reference').notNull(),
    termsVersion: text('terms_version').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: at('created_at').defaultNow().notNull(),
  },
  table => [
    unique('sponsor_term_revisions_tenant_id_id_uq').on(table.tenantId, table.id),
    uniqueIndex('sponsor_term_revisions_term_revision_uq').on(table.termId, table.revision),
    foreignKey({
      name: 'sponsor_term_revisions_term_fk',
      columns: [table.tenantId, table.termId],
      foreignColumns: [sponsorTerms.tenantId, sponsorTerms.id],
    }),
    foreignKey({
      name: 'sponsor_term_revisions_created_by_fk',
      columns: [table.tenantId, table.createdBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check('sponsor_term_revisions_revision_check', sql`${table.revision} > 0`),
    check('sponsor_term_revisions_seat_count_check', sql`${table.seatCount} between 1 and 500`),
    check('sponsor_term_revisions_price_check', sql`${table.pricePerSeatMinor} >= 0`),
    check('sponsor_term_revisions_currency_check', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    sponsorTenantPolicy('sponsor_term_revisions_tenant_policy', table.tenantId),
  ]
).enableRLS();

/** Append-only staff decision on one revision; the decider is never the creator. */
export const sponsorRevisionDecisions = pgTable(
  'sponsor_revision_decisions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    revisionId: text('revision_id').notNull(),
    decision: text('decision', { enum: ['approved', 'rejected'] }).notNull(),
    decidedBy: text('decided_by').notNull(),
    decidedAt: at('decided_at').defaultNow().notNull(),
    invoiceReference: text('invoice_reference'),
  },
  table => [
    unique('sponsor_revision_decisions_tenant_id_id_uq').on(table.tenantId, table.id),
    uniqueIndex('sponsor_revision_decisions_revision_uq').on(table.revisionId),
    foreignKey({
      name: 'sponsor_revision_decisions_revision_fk',
      columns: [table.tenantId, table.revisionId],
      foreignColumns: [sponsorTermRevisions.tenantId, sponsorTermRevisions.id],
    }),
    foreignKey({
      name: 'sponsor_revision_decisions_decided_by_fk',
      columns: [table.tenantId, table.decidedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'sponsor_revision_decisions_decision_check',
      sql`${table.decision} in ('approved', 'rejected')`
    ),
    sponsorTenantPolicy('sponsor_revision_decisions_tenant_policy', table.tenantId),
  ]
).enableRLS();
