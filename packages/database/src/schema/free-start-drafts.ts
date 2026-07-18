import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { tenants } from './tenants';

export const freeStartDrafts = pgTable(
  'free_start_drafts',
  {
    id: text('id')
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accessTenantId: text('access_tenant_id')
      .notNull()
      .references(() => tenants.id),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id),
    clientRequestId: uuid('client_request_id').notNull(),
    category: text('category').notNull(),
    issueType: text('issue_type'),
    incidentDate: date('incident_date'),
    counterparty: varchar('counterparty', { length: 160 }),
    desiredOutcome: text('desired_outcome'),
    summary: varchar('summary', { length: 1000 }),
    resumeStep: text('resume_step').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  table => {
    const ownerAccessScope = sql`${table.accessTenantId} = (select current_setting('app.current_access_tenant_id', true))::text
      and ${table.ownerUserId} = (select current_setting('app.current_actor_id', true))::text`;

    return [
      uniqueIndex('free_start_drafts_owner_request_uq').on(
        table.accessTenantId,
        table.ownerUserId,
        table.clientRequestId
      ),
      index('free_start_drafts_owner_updated_idx').on(
        table.accessTenantId,
        table.ownerUserId,
        table.updatedAt.desc(),
        table.id.desc()
      ),
      check(
        'free_start_drafts_tenant_access_check',
        sql`${table.tenantId} = ${table.accessTenantId}`
      ),
      check(
        'free_start_drafts_issue_matrix_check',
        sql`(${table.category} = 'vehicle' and (${table.issueType} is null or ${table.issueType} in ('collision','theft','parking_damage','insurer_delay')))
          or (${table.category} = 'property' and (${table.issueType} is null or ${table.issueType} in ('water_damage','storm_fire','burglary','landlord_dispute')))`
      ),
      check(
        'free_start_drafts_outcome_check',
        sql`${table.desiredOutcome} is null or ${table.desiredOutcome} in ('repair','reimbursement','compensation','written_response')`
      ),
      check(
        'free_start_drafts_resume_step_check',
        sql`${table.resumeStep} in ('category','details','preview')`
      ),
      check('free_start_drafts_version_check', sql`${table.version} > 0`),
      pgPolicy('free_start_drafts_owner_access_policy', {
        for: 'all',
        using: ownerAccessScope,
        withCheck: ownerAccessScope,
      }),
    ];
  }
).enableRLS();

export type FreeStartDraftRow = typeof freeStartDrafts.$inferSelect;
export type NewFreeStartDraftRow = typeof freeStartDrafts.$inferInsert;
