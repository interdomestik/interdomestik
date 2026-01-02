import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

export const policies = pgTable('policies', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  provider: text('provider'),
  policyNumber: text('policy_number'),
  analysisJson: jsonb('analysis_json').$type<Record<string, unknown>>().notNull().default({}),
  fileUrl: text('file_url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
