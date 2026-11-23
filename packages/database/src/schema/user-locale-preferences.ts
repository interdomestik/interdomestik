import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sponsorTenantPolicy } from './sponsors';

export const userLocalePreferences = pgTable(
  'user_locale_preferences',
  {
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    locale: text('locale', { enum: ['sq', 'en', 'sr', 'mk', 'de'] }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('user_locale_preferences_user_uq').on(table.tenantId, table.userId),
    check(
      'user_locale_preferences_locale_check',
      sql`${table.locale} in ('sq', 'en', 'sr', 'mk', 'de')`
    ),
    sponsorTenantPolicy('user_locale_preferences_tenant_policy', table.tenantId),
  ]
).enableRLS();
