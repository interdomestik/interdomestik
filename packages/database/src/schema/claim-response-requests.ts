import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
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
    answeredBy: text('answered_by'),
    answerKind: text('answer_kind'),
    answerMessageId: text('answer_message_id'),
  },
  table => [
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
