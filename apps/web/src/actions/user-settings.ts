'use server';

import type { NotificationPreferences } from './user-settings/types';

export type { NotificationPreferences } from './user-settings/types';

import { getActionContext } from './user-settings/context';
import { getNotificationPreferencesCore } from './user-settings/get';
import { updateNotificationPreferencesCore } from './user-settings/update';

export async function getNotificationPreferences() {
  const { session } = await getActionContext();
  return getNotificationPreferencesCore({ session });
}

export async function updateNotificationPreferences(preferences: NotificationPreferences) {
  const { session } = await getActionContext();
  return updateNotificationPreferencesCore({ session, preferences });
}
