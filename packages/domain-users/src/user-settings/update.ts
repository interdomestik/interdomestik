import { db } from '@interdomestik/database';
import { userNotificationPreferences } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import type { UserSession } from '../types';
import type { NotificationPreferences } from './types';

export async function updateNotificationPreferencesCore(params: {
  session: UserSession | null;
  preferences: NotificationPreferences;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { session, preferences } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const [existing] = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, session.user.id))
      .limit(1);

    if (existing) {
      await db
        .update(userNotificationPreferences)
        .set({
          ...preferences,
          updatedAt: new Date(),
        })
        .where(eq(userNotificationPreferences.userId, session.user.id));
    } else {
      await db.insert(userNotificationPreferences).values({
        id: nanoid(),
        userId: session.user.id,
        ...preferences,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return { success: false, error: 'Failed to save preferences' };
  }
}
