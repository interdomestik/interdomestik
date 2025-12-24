'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { notifications } from '@interdomestik/database/schema';
import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

/**
 * Get the current user's notifications
 */
export async function getNotifications(limit = 20) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  const data = await db.query.notifications.findMany({
    where: eq(notifications.userId, session.user.id),
    orderBy: [desc(notifications.createdAt)],
    limit: limit,
  });

  return data;
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, session.user.id)));

  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * Mark all notifications as read for current user
 */
export async function markAllAsRead() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(eq(notifications.userId, session.user.id));

  revalidatePath('/dashboard');
  return { success: true };
}
