import { db } from '@interdomestik/database';
import { userNotificationPreferences } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type NotificationPreferences = {
  emailClaimUpdates: boolean;
  emailMarketing: boolean;
  emailNewsletter: boolean;
  pushClaimUpdates: boolean;
  pushMessages: boolean;
  inAppAll: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailClaimUpdates: true,
  emailMarketing: false,
  emailNewsletter: true,
  pushClaimUpdates: true,
  pushMessages: true,
  inAppAll: true,
};

export async function getNotificationPreferencesCore(args: {
  userId: string;
  tenantId?: string | null;
}): Promise<NotificationPreferences> {
  const { userId, tenantId } = args;
  const resolvedTenantId = tenantId ?? 'tenant_mk';

  const [preferences] = await db
    .select()
    .from(userNotificationPreferences)
    .where(
      and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.tenantId, resolvedTenantId)
      )
    )
    .limit(1);

  if (!preferences) return DEFAULT_NOTIFICATION_PREFERENCES;

  return {
    emailClaimUpdates: preferences.emailClaimUpdates,
    emailMarketing: preferences.emailMarketing,
    emailNewsletter: preferences.emailNewsletter,
    pushClaimUpdates: preferences.pushClaimUpdates,
    pushMessages: preferences.pushMessages,
    inAppAll: preferences.inAppAll,
  };
}

export async function upsertNotificationPreferencesCore(args: {
  userId: string;
  tenantId?: string | null;
  preferences: NotificationPreferences;
}): Promise<void> {
  const { userId, tenantId, preferences } = args;
  const resolvedTenantId = tenantId ?? 'tenant_mk';

  const [existing] = await db
    .select()
    .from(userNotificationPreferences)
    .where(
      and(
        eq(userNotificationPreferences.userId, userId),
        eq(userNotificationPreferences.tenantId, resolvedTenantId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(userNotificationPreferences)
      .set({
        ...preferences,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userNotificationPreferences.userId, userId),
          eq(userNotificationPreferences.tenantId, resolvedTenantId)
        )
      );

    return;
  }

  await db.insert(userNotificationPreferences).values({
    id: nanoid(),
    tenantId: resolvedTenantId,
    userId,
    ...preferences,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
