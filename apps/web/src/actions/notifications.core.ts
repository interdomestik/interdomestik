'use server';

import { revalidatePath } from 'next/cache';

import { getActionContext } from './notifications/context';
import { getNotificationsCore } from './notifications/get';
import { markAllAsReadCore, markAsReadCore } from './notifications/mark-read';

/**
 * Get the current user's notifications
 */
export async function getNotifications(limit = 20) {
  const { session } = await getActionContext();
  return getNotificationsCore({ session, limit });
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string) {
  const { session, requestHeaders } = await getActionContext();
  const result = await markAsReadCore({ session, notificationId, requestHeaders });
  revalidatePath('/dashboard');
  return result;
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllAsRead() {
  const { session } = await getActionContext();
  const result = await markAllAsReadCore({ session });
  revalidatePath('/dashboard');
  return result;
}
