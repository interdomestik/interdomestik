import { boolean, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { sponsorTenantPolicy } from './sponsors';

export const notificationPreviewRestrictions = pgTable(
  'notification_preview_restrictions',
  {
    notificationId: text('notification_id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    restricted: boolean('restricted').notNull(),
  },
  table => [
    uniqueIndex('notification_preview_restrictions_notification_uq').on(
      table.tenantId,
      table.notificationId
    ),
    sponsorTenantPolicy('notification_preview_restrictions_tenant_policy', table.tenantId),
  ]
).enableRLS();
