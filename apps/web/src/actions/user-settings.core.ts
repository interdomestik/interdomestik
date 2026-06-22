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
  const { session } = await getActionContext();
  return getNotificationPreferencesCore({ session });
}

export async function updateNotificationPreferences(preferences: NotificationPreferences) {
  const { session } = await getActionContext();
  const requestHeaders = await headers();
  return updateNotificationPreferencesCore({ session, requestHeaders, preferences });
}

export async function updateResidenceCountry(residenceCountry: string) {
  const { session } = await getActionContext();
  const requestHeaders = await headers();
  return updateResidenceCountryCore({ session, requestHeaders, residenceCountry });
}
