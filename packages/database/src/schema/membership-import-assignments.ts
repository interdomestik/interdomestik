import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgPolicy, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { sponsors } from './sponsors';
import { legalEntities } from './tenant-entity-decomposition';

export const membershipImportAssignments = pgTable(
  'membership_import_assignments',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    legalEntityId: text('legal_entity_id').notNull(),
    staffUserId: text('staff_user_id').notNull(),
    sourceKey: text('source_key'),
    sponsorId: text('sponsor_id'),
    approvedBy: text('approved_by').notNull(),
    evidenceRef: text('evidence_ref').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true, mode: 'string' }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    revokedBy: text('revoked_by'),
  },
  table => [
    index('membership_import_assignments_staff_idx').on(
      table.tenantId,
      table.staffUserId,
      table.legalEntityId
    ),
    foreignKey({
      name: 'membership_import_assignments_entity_fk',
      columns: [table.tenantId, table.legalEntityId],
      foreignColumns: [legalEntities.tenantId, legalEntities.id],
    }),
    foreignKey({
      name: 'membership_import_assignments_sponsor_fk',
      columns: [table.tenantId, table.sponsorId],
      foreignColumns: [sponsors.tenantId, sponsors.id],
    }),
    foreignKey({
      name: 'membership_import_assignments_staff_fk',
      columns: [table.tenantId, table.staffUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_import_assignments_approver_fk',
      columns: [table.tenantId, table.approvedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    foreignKey({
      name: 'membership_import_assignments_revoker_fk',
      columns: [table.tenantId, table.revokedBy],
      foreignColumns: [user.tenantId, user.id],
    }),
    check(
      'membership_import_assignments_scope_ck',
      sql`num_nonnulls(${table.sourceKey}, ${table.sponsorId}) = 1
        and (${table.sourceKey} is null or ${table.sourceKey} ~ '[^[:space:]]')`
    ),
    check(
      'membership_import_assignments_validity_ck',
      sql`isfinite(${table.validFrom}) and isfinite(${table.validUntil})
        and ${table.validFrom} < ${table.validUntil}`
    ),
    check(
      'membership_import_assignments_revocation_ck',
      sql`(${table.revokedAt} is null) = (${table.revokedBy} is null)
        and (${table.revokedAt} is null or isfinite(${table.revokedAt}))`
    ),
    check('membership_import_assignments_evidence_ck', sql`${table.evidenceRef} ~ '[^[:space:]]'`),
    pgPolicy('membership_import_assignments_select', {
      for: 'select',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and nullif((select current_setting('app.current_actor_id', true)), '') is not null
        and ((select current_setting('app.current_actor_role', true)) = 'tenant_admin'
          or ((select current_setting('app.current_actor_role', true)) = 'staff'
            and ${table.staffUserId} = (select current_setting('app.current_actor_id', true))))`,
    }),
    pgPolicy('membership_import_assignments_insert', {
      for: 'insert',
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and ${table.approvedBy} = nullif((select current_setting('app.current_actor_id', true)), '')
        and ${table.revokedAt} is null`,
    }),
    pgPolicy('membership_import_assignments_revoke', {
      for: 'update',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and ${table.revokedAt} is null`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and ${table.revokedAt} is not null
        and ${table.revokedBy} = nullif((select current_setting('app.current_actor_id', true)), '')`,
    }),
  ]
).enableRLS();
