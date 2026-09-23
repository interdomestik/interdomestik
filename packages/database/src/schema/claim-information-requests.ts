import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { claimDocuments } from './claim-support-tables';
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
      uniqueIndex('claim_information_requests_tenant_claim_id_uq').on(
        table.tenantId,
        table.claimId,
        table.id
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

export const claimInformationRequestEvidence = pgTable(
  'claim_information_request_evidence',
  {
    tenantId: text('tenant_id').notNull(),
    claimId: text('claim_id').notNull(),
    requestId: uuid('request_id').notNull(),
    documentId: text('document_id').notNull(),
    submittedByMemberId: text('submitted_by_member_id')
      .notNull()
      .references(() => user.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    acknowledgedByStaffId: text('acknowledged_by_staff_id').references(() => user.id),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true, precision: 3 }),
  },
  table => {
    const tenantScope = sql`${table.tenantId} = (select current_setting('app.current_tenant_id', true))::text`;
    return [
      primaryKey({
        name: 'claim_information_request_evidence_pk',
        columns: [table.requestId, table.documentId],
      }),
      uniqueIndex('claim_information_request_evidence_document_uq').on(table.documentId),
      index('claim_information_request_evidence_request_idx').on(
        table.tenantId,
        table.claimId,
        table.requestId,
        table.submittedAt
      ),
      foreignKey({
        name: 'claim_information_request_evidence_request_fk',
        columns: [table.tenantId, table.claimId, table.requestId],
        foreignColumns: [
          claimInformationRequests.tenantId,
          claimInformationRequests.claimId,
          claimInformationRequests.id,
        ],
      }).onDelete('cascade'),
      foreignKey({
        name: 'claim_information_request_evidence_document_fk',
        columns: [table.tenantId, table.claimId, table.documentId],
        foreignColumns: [claimDocuments.tenantId, claimDocuments.claimId, claimDocuments.id],
      }).onDelete('cascade'),
      check(
        'claim_information_request_evidence_ack_check',
        sql`(${table.acknowledgedAt} is null and ${table.acknowledgedByStaffId} is null)
          or (${table.acknowledgedAt} is not null and ${table.acknowledgedByStaffId} is not null)`
      ),
      pgPolicy('claim_information_request_evidence_tenant_policy', {
        for: 'all',
        using: tenantScope,
        withCheck: tenantScope,
      }),
    ];
  }
).enableRLS();
