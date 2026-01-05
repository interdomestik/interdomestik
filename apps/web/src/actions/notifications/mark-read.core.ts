import {
  markAllAsReadCore as markAllAsReadCoreDomain,
  markAsReadCore as markAsReadCoreDomain,
} from '@interdomestik/domain-communications/notifications/mark-read';
import { markNotificationReadSchema } from '@interdomestik/domain-communications/notifications/schemas';
import type { Session } from './context';

export async function markAsReadCore(params: { session: Session | null; notificationId: string }) {
  const validation = markNotificationReadSchema.safeParse({
    notificationId: params.notificationId,
  });
  if (!validation.success) {
    throw new Error(validation.error.flatten().fieldErrors.notificationId?.[0] || 'Invalid input');
  }
  return markAsReadCoreDomain(params);
}

export async function markAllAsReadCore(params: { session: Session | null }) {
  return markAllAsReadCoreDomain(params);
}
