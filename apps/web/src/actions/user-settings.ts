'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { userNotificationPreferences } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export interface NotificationPreferences {
  emailClaimUpdates: boolean;
  emailMarketing: boolean;
  emailNewsletter: boolean;
  pushClaimUpdates: boolean;
  pushMessages: boolean;
  inAppAll: boolean;
}

export async function getNotificationPreferences() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const [preferences] = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, session.user.id))
      .limit(1);

    if (!preferences) {
      return {
        success: true,
        preferences: {
          emailClaimUpdates: true,
          emailMarketing: false,
          emailNewsletter: true,
          pushClaimUpdates: true,
          pushMessages: true,
          inAppAll: true,
        },
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
    };
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return { success: false, error: 'Failed to fetch preferences' };
  }
}

export async function updateNotificationPreferences(preferences: NotificationPreferences) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

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

    revalidatePath('/dashboard/settings');
    return { success: true };
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return { success: false, error: 'Failed to save preferences' };
  }
}
