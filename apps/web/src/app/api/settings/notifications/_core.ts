import { db } from '@interdomestik/database';
import { userNotificationPreferences } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
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
}): Promise<NotificationPreferences> {
  const { userId } = args;

  const [preferences] = await db
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
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
  preferences: NotificationPreferences;
}): Promise<void> {
  const { userId, preferences } = args;

  const [existing] = await db
    .select()
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(userNotificationPreferences)
      .set({
        ...preferences,
        updatedAt: new Date(),
      })
      .where(eq(userNotificationPreferences.userId, userId));

    return;
  }

  await db.insert(userNotificationPreferences).values({
    id: nanoid(),
    userId,
    ...preferences,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
