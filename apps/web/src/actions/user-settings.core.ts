'use server';

import { headers } from 'next/headers';

import type { NotificationPreferences } from './user-settings/types';

export type { NotificationPreferences } from './user-settings/types';

import { getActionContext } from './user-settings/context';
import { getNotificationPreferencesCore } from './user-settings/get';
import {
  updateNotificationPreferencesCore,
  updateResidenceCountryCore,
} from './user-settings/update';

export async function getNotificationPreferences() {
  const { session, authority } = await getActionContext();
  return getNotificationPreferencesCore({ session, authority });
}

export async function updateNotificationPreferences(preferences: NotificationPreferences) {
  const { session, authority } = await getActionContext();
  const requestHeaders = await headers();
  return updateNotificationPreferencesCore({ session, authority, requestHeaders, preferences });
}

export async function updateResidenceCountry(residenceCountry: string) {
  const { session, authority } = await getActionContext();
  const requestHeaders = await headers();
  return updateResidenceCountryCore({ session, authority, requestHeaders, residenceCountry });
}
