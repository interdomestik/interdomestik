import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { claims } from './claim-core';
import { claimMessages } from './claim-support-tables';
import { sponsorTenantPolicy } from './sponsors';

export const claimResponseRequests = pgTable(
  'claim_response_requests',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    claimId: text('claim_id').notNull(),
    kind: text('kind', { enum: ['claim_submitted', 'member_message'] }).notNull(),
    sourceMessageId: text('source_message_id'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    answeredBy: text('answered_by').references(() => user.id),
    answerKind: text('answer_kind'),
    answerMessageId: text('answer_message_id'),
  },
  table => [
    foreignKey({
      name: 'claim_response_requests_claim_fk',
      columns: [table.tenantId, table.claimId],
      foreignColumns: [claims.tenantId, claims.id],
    }),
    foreignKey({
      name: 'claim_response_requests_source_fk',
      columns: [table.tenantId, table.claimId, table.sourceMessageId],
      foreignColumns: [claimMessages.tenantId, claimMessages.claimId, claimMessages.id],
    }),
    foreignKey({
      name: 'claim_response_requests_answer_fk',
      columns: [table.tenantId, table.claimId, table.answerMessageId],
      foreignColumns: [claimMessages.tenantId, claimMessages.claimId, claimMessages.id],
    }),
    check(
      'claim_response_requests_kind_check',
      sql`${table.kind} in ('claim_submitted', 'member_message')`
    ),
    check(
      'claim_response_requests_source_check',
      sql`(${table.kind} = 'member_message') = (${table.sourceMessageId} is not null)`
    ),
    sponsorTenantPolicy('claim_response_requests_tenant_policy', table.tenantId),
  ]
).enableRLS();
