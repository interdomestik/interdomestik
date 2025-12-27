import { db } from '@interdomestik/database';
import { userNotificationPreferences } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

import type { UserSession } from '../types';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from './types';

export async function getNotificationPreferencesCore(params: {
  session: UserSession | null;
}): Promise<
  | { success: true; preferences: NotificationPreferences; error?: undefined }
  | { success: false; error: string }
> {
  const { session } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const [preferences] = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, session.user.id))
      .limit(1);

    if (!preferences) {
      return {
        success: true,
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
        error: undefined,
      };
    }

    return {
      success: true,
      preferences: {
        emailClaimUpdates: preferences.emailClaimUpdates,
        emailMarketing: preferences.emailMarketing,
        emailNewsletter: preferences.emailNewsletter,
        pushClaimUpdates: preferences.pushClaimUpdates,
        pushMessages: preferences.pushMessages,
        inAppAll: preferences.inAppAll,
      },
      error: undefined,
    };
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return { success: false, error: 'Failed to fetch preferences' };
  }
}
