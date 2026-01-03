import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { tenants } from './tenants';

export const policies = pgTable(
  'policies',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    provider: text('provider'),
    policyNumber: text('policy_number'),
    analysisJson: jsonb('analysis_json').$type<Record<string, unknown>>().notNull().default({}),
    fileUrl: text('file_url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userTenantCreatedIdx: index('idx_policies_user_tenant_created').on(
      table.userId,
      table.tenantId,
      table.createdAt
    ),
  })
);
