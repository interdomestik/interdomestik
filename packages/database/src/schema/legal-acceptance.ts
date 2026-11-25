import { sql } from 'drizzle-orm';
import { check, foreignKey, pgPolicy, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { tenants } from './tenants';

export const legalAcceptances = pgTable(
  'legal_acceptances',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    subjectUserId: text('subject_user_id').notNull(),
    documentKind: text('document_kind').notNull(),
    documentVersion: text('document_version').notNull(),
    locale: text('locale').notNull(),
    textSha256: text('text_sha256').notNull(),
    sourceSurface: text('source_surface').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  table => [
    unique('legal_acceptances_subject_version_uq').on(
      table.tenantId,
      table.subjectUserId,
      table.documentKind,
      table.documentVersion
    ),
    foreignKey({
      name: 'legal_acceptances_subject_fk',
      columns: [table.tenantId, table.subjectUserId],
      foreignColumns: [user.tenantId, user.id],
    }),
    check('legal_acceptances_source_check', sql`${table.sourceSurface} = 'member_activation'`),
    pgPolicy('legal_acceptances_select', {
      for: 'select',
      using: sql`${table.tenantId} = nullif(current_setting('app.current_access_tenant_id', true), '')
        and nullif(current_setting('app.current_actor_id', true), '') is not null
        and nullif(current_setting('app.current_actor_role', true), '') is not null
        and (${table.subjectUserId} = current_setting('app.current_actor_id', true)
          or current_setting('app.current_actor_role', true) = 'tenant_admin')`,
    }),
    pgPolicy('legal_acceptances_insert', {
      for: 'insert',
      withCheck: sql`${table.tenantId} = nullif(current_setting('app.current_access_tenant_id', true), '')
        and ${table.subjectUserId} = nullif(current_setting('app.current_actor_id', true), '')
        and current_setting('app.current_actor_role', true) in ('member', 'user')`,
    }),
  ]
).enableRLS();
