'use server';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  updateResidenceCountry,
} from './user-settings.core';

export type { NotificationPreferences } from './user-settings.core';
export { getNotificationPreferences, updateNotificationPreferences, updateResidenceCountry };
