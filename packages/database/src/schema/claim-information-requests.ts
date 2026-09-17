import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { claims } from './claim-core';
import { tenants } from './tenants';

export const claimInformationRequests = pgTable(
  'claim_information_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),
    correlationId: uuid('correlation_id').notNull(),
    requestedInformation: varchar('requested_information', { length: 1000 }).notNull(),
    explanationForMember: varchar('explanation_for_member', { length: 1000 }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, precision: 3 }).notNull(),
    responsibleStaffId: text('responsible_staff_id')
      .notNull()
      .references(() => user.id),
    createdByStaffId: text('created_by_staff_id')
      .notNull()
      .references(() => user.id),
    slaPosture: text('sla_posture').$type<'incomplete'>().notNull(),
    status: text('status').$type<'open'>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  table => {
    const tenantScope = sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text`;
    return [
      uniqueIndex('claim_information_requests_correlation_uq').on(
        table.tenantId,
        table.correlationId
      ),
      index('claim_information_requests_claim_idx').on(
        table.tenantId,
        table.claimId,
        table.createdAt
      ),
      check(
        'claim_information_requests_text_check',
        sql`length(btrim(${table.requestedInformation})) > 0 and length(btrim(${table.explanationForMember})) > 0`
      ),
      check(
        'claim_information_requests_posture_check',
        sql`${table.slaPosture} = 'incomplete' and ${table.status} = 'open'`
      ),
      check(
        'claim_information_requests_owner_check',
        sql`${table.responsibleStaffId} = ${table.createdByStaffId}`
      ),
      pgPolicy('claim_information_requests_tenant_policy', {
        for: 'all',
        using: tenantScope,
        withCheck: sql`${tenantScope} and exists (select 1 from "claim" c where c.id = ${table.claimId} and c.tenant_id = ${table.tenantId})`,
      }),
    ];
  }
).enableRLS();
