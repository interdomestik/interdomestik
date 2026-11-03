import { userNotificationPreferences } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  authority: TenantAuthority;
}): Promise<NotificationPreferences> {
  const { userId, authority } = args;
  const { tenantId: resolvedTenantId } = readTenantAuthority(authority);

  const [preferences] = await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .select()
        .from(userNotificationPreferences)
        .where(
          and(
            eq(userNotificationPreferences.userId, userId),
            eq(userNotificationPreferences.tenantId, resolvedTenantId)
          )
        )
        .limit(1)
  );

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
  authority: TenantAuthority;
  preferences: NotificationPreferences;
}): Promise<void> {
  const { userId, authority, preferences } = args;
  const { tenantId: resolvedTenantId } = readTenantAuthority(authority);

  const [existing] = await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .select()
        .from(userNotificationPreferences)
        .where(
          and(
            eq(userNotificationPreferences.userId, userId),
            eq(userNotificationPreferences.tenantId, resolvedTenantId)
          )
        )
        .limit(1)
  );

  if (existing) {
    await withTenantAuthority(
      authority,
      async tx =>
        await tx
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
          )
    );

    return;
  }

  // db-access-guard: tenant-scoped -- reason: tenantId from validated route context before preference insert
  await withTenantAuthority(
    authority,
    async tx =>
      await tx.insert(userNotificationPreferences).values({
        id: nanoid(),
        tenantId: resolvedTenantId,
        userId,
        ...preferences,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
  );
}
