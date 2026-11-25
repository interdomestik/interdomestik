import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sponsorTenantPolicy } from './sponsors';

export const supportHandoffFirstResponses = pgTable(
  'support_handoff_first_responses',
  {
    handoffId: text('handoff_id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    firstPublicResponseAt: timestamp('first_public_response_at', { withTimezone: true }).notNull(),
  },
  table => [
    uniqueIndex('support_handoff_first_responses_handoff_uq').on(table.tenantId, table.handoffId),
    sponsorTenantPolicy('support_handoff_first_responses_tenant_policy', table.tenantId),
  ]
).enableRLS();
