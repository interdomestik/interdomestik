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
import { sponsorTermRevisions } from './sponsors';
import { legalEntities } from './tenant-entity-decomposition';

export const membershipImportLists = pgTable(
  'membership_import_lists',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    origin: text('origin').notNull(),
    sourceKey: text('source_key'),
    sponsorId: text('sponsor_id'),
    termId: text('term_id'),
    contractYearId: text('contract_year_id'),
    commercialRevision: integer('commercial_revision'),
    uploadKey: text('upload_key').notNull(),
    uploadPosition: integer('upload_position').notNull(),
    uploadAnchorPosition: integer('upload_anchor_position').notNull().default(1),
    uploadListCount: integer('upload_list_count').notNull(),
    uploadFingerprint: text('upload_fingerprint').notNull(),
    templateVersion: text('template_version').notNull(),
    canonicalizationVersion: text('canonicalization_version').notNull(),
    digest: text('digest').notNull(),
    rowCount: integer('row_count').notNull(),
    submittedBy: text('submitted_by').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }).notNull(),
    verifiedBy: text('verified_by').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'string' }).notNull(),
    employerApproverRef: text('employer_approver_ref'),
    employerApprovedAt: timestamp('employer_approved_at', { withTimezone: true, mode: 'string' }),
    employerApprovalRef: text('employer_approval_ref'),
    employerApprovedDigest: text('employer_approved_digest'),
    decision: text('decision'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'string' }),
    decidedDigest: text('decided_digest'),
  },
  table => [
    unique('membership_import_lists_origin_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.id,
      table.origin
    ),
    unique('membership_import_lists_year_uq').on(
      table.tenantId,
      table.legalEntityId,
      table.id,
      table.contractYearId
    ),
    unique('membership_import_lists_digest_uq').on(table.tenantId, table.digest),
    unique('membership_import_lists_position_uq').on(
      table.tenantId,
      table.uploadKey,
      table.uploadPosition
    ),
    unique('membership_import_lists_upload_claim_uq').on(
      table.tenantId,
      table.uploadKey,
      table.uploadPosition,
      table.uploadFingerprint,
      table.uploadListCount
    ),
    // Every position in the ordered set references the single position-1 claim.
    foreignKey({
      name: 'membership_import_lists_upload_claim_fk',
      columns: [
        table.tenantId,
        table.uploadKey,
        table.uploadAnchorPosition,
        table.uploadFingerprint,
        table.uploadListCount,
      ],
      foreignColumns: [
        table.tenantId,
        table.uploadKey,
        table.uploadPosition,
        table.uploadFingerprint,
        table.uploadListCount,
      ],
    }),
    foreignKey({
      name: 'membership_import_lists_entity_fk',
      columns: [table.tenantId, table.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      name: 'membership_import_lists_revision_fk',
      columns: [table.termId, table.commercialRevision],
      foreignColumns: [sponsorTermRevisions.termId, sponsorTermRevisions.revision],
    }),
    foreignKey({
      name: 'membership_import_lists_submitter_fk',
      columns: [table.tenantId, table.submittedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_import_lists_verifier_fk',
      columns: [table.tenantId, table.verifiedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_import_lists_decider_fk',
      columns: [table.tenantId, table.decidedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'membership_import_lists_target_ck',
      sql`(${table.origin} = 'prior_paid_individual' and ${table.sourceKey} is not null
        and ${table.sourceKey} ~ '[^[:space:]]'
        and num_nonnulls(${table.sponsorId}, ${table.termId}, ${table.contractYearId}, ${table.commercialRevision}) = 0)
        or (${table.origin} in ('prior_paid_company', 'new_company') and ${table.sourceKey} is null
          and num_nonnulls(${table.sponsorId}, ${table.termId}, ${table.contractYearId}) = 3
          and (${table.origin} <> 'new_company' or ${table.commercialRevision} is not null))`
    ),
    check(
      'membership_import_lists_upload_ck',
      sql`${table.uploadKey} ~ '[^[:space:]]' and ${table.uploadAnchorPosition} = 1
        and ${table.uploadPosition} between 1 and ${table.uploadListCount}
        and ${table.uploadFingerprint} ~ '^[0-9a-f]{64}$'
        and ${table.digest} ~ '^[0-9a-f]{64}$' and ${table.rowCount} > 0
        and ${table.templateVersion} ~ '[^[:space:]]' and ${table.canonicalizationVersion} ~ '[^[:space:]]'`
    ),
    check(
      'membership_import_lists_verification_ck',
      sql`isfinite(${table.submittedAt}) and isfinite(${table.verifiedAt})
        and ${table.verifiedAt} >= ${table.submittedAt}`
    ),
    check(
      'membership_import_lists_employer_approval_ck',
      sql`(${table.origin} <> 'new_company' and num_nonnulls(${table.employerApproverRef},
        ${table.employerApprovedAt}, ${table.employerApprovalRef}, ${table.employerApprovedDigest}) = 0)
        or (num_nonnulls(${table.employerApproverRef}, ${table.employerApprovedAt},
          ${table.employerApprovalRef}, ${table.employerApprovedDigest}) = 4
          and ${table.employerApproverRef} ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
          and ${table.employerApprovalRef} ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
          and isfinite(${table.employerApprovedAt}) and ${table.employerApprovedAt} <= ${table.verifiedAt}
          and ${table.employerApprovedDigest} = ${table.digest})`
    ),
    check(
      'membership_import_lists_decision_ck',
      sql`num_nonnulls(${table.decision}, ${table.decidedBy}, ${table.decidedAt}, ${table.decidedDigest}) = 0
        or (num_nonnulls(${table.decision}, ${table.decidedBy}, ${table.decidedAt}, ${table.decidedDigest}) = 4
          and ${table.decision} in ('approved', 'rejected') and isfinite(${table.decidedAt})
          and ${table.decidedAt} >= ${table.verifiedAt} and ${table.decidedDigest} = ${table.digest}
          and ${table.decidedBy} <> ${table.submittedBy} and ${table.decidedBy} <> ${table.verifiedBy})`
    ),
    // Staff see lists of their current import assignment; an admin sees only the lists of a
    // current decision delegation for the exact entity and target.
    pgPolicy('membership_import_lists_select', {
      for: 'select',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (((select current_setting('app.current_actor_role', true)) = 'tenant_admin' and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = ${table.tenantId}
              and assignment.legal_entity_id = ${table.legalEntityId}
              and assignment.capacity = 'decision'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and (assignment.source_key = ${table.sourceKey} or assignment.sponsor_id = ${table.sponsorId})
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          ))
          or ((select current_setting('app.current_actor_role', true)) = 'staff' and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = ${table.tenantId}
              and assignment.legal_entity_id = ${table.legalEntityId}
              and assignment.capacity = 'import'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and (assignment.source_key = ${table.sourceKey} or assignment.sponsor_id = ${table.sponsorId})
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          )))`,
    }),
    // Only assigned staff submit; the verifier is the submitting staff member.
    pgPolicy('membership_import_lists_insert', {
      for: 'insert',
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and ${table.decision} is null
        and ${table.submittedBy} = (select current_setting('app.current_actor_id', true))
        and ${table.verifiedBy} = ${table.submittedBy}
        and (select current_setting('app.current_actor_role', true)) = 'staff'
        and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = ${table.tenantId}
              and assignment.legal_entity_id = ${table.legalEntityId}
              and assignment.capacity = 'import'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and (assignment.source_key = ${table.sourceKey} or assignment.sponsor_id = ${table.sponsorId})
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          )`,
    }),
    // A decision needs a current delegation for the exact entity and target, and a decider
    // other than the submitter and verifier. Every list is complete from its own commit.
    pgPolicy('membership_import_lists_decide', {
      for: 'update',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and ${table.decision} is null`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and ${table.decidedBy} = (select current_setting('app.current_actor_id', true))
        and ${table.decision} is not null
        and ${table.decidedBy} <> ${table.submittedBy}
        and ${table.decidedBy} <> ${table.verifiedBy}
        and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = ${table.tenantId}
              and assignment.legal_entity_id = ${table.legalEntityId}
              and assignment.capacity = 'decision'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and (assignment.source_key = ${table.sourceKey} or assignment.sponsor_id = ${table.sponsorId})
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          )`,
    }),
  ]
).enableRLS();
