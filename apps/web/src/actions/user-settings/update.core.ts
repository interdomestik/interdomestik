import { revalidatePath } from 'next/cache';

import { updateNotificationPreferencesCore as updateNotificationPreferencesDomain } from '@interdomestik/domain-users/user-settings/update';
import type { NotificationPreferences } from '@interdomestik/domain-users/user-settings/types';
import type { UserSession } from '@interdomestik/domain-users/types';

import type { Session } from './context';

export async function updateNotificationPreferencesCore(params: {
  session: NonNullable<Session> | null;
  preferences: NotificationPreferences;
}): Promise<{ success: true } | { success: false; error: string }> {
  const result = await updateNotificationPreferencesDomain({
    session: params.session as UserSession | null,
    preferences: params.preferences,
  });

  if (result.success) {
    revalidatePath('/member/settings');
  }

  return result;
}
