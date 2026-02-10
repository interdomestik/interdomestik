'use server';

import { revalidatePath } from 'next/cache';

import { getActionContext } from './notifications/context';
import { getNotificationsCore } from './notifications/get';
import { markAllAsReadCore, markAsReadCore } from './notifications/mark-read';

function isUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  return /not authenticated|unauthorized/i.test(message);
}

/**
 * Get the current user's notifications
 */
export async function getNotifications(limit = 20) {
  const { session } = await getActionContext();
  try {
    return await getNotificationsCore({ session, limit });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string) {
  const { session, requestHeaders } = await getActionContext();
  let result;
  try {
    result = await markAsReadCore({ session, notificationId, requestHeaders });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { success: false, error: 'Unauthorized' } as const;
    }
    throw error;
  }
  revalidatePath('/dashboard');
  return result;
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllAsRead() {
  const { session } = await getActionContext();
  let result;
  try {
    result = await markAllAsReadCore({ session });
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { success: false, error: 'Unauthorized' } as const;
    }
    throw error;
  }
  revalidatePath('/dashboard');
  return result;
}
