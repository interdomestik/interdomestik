import {
  markAllAsReadCore as markAllAsReadCoreDomain,
  markAsReadCore as markAsReadCoreDomain,
} from '@interdomestik/domain-communications/notifications/mark-read';
import { markNotificationReadSchema } from '@interdomestik/domain-communications/notifications/schemas';
import type { Session } from './context';

import { enforceRateLimit } from '@/lib/rate-limit';

export async function markAsReadCore(params: {
  session: Session | null;
  notificationId: string;
  requestHeaders: Headers;
}) {
  if (params.session?.user?.id) {
    const rateLimit = await enforceRateLimit({
      name: `action:mark-notif-read:${params.session.user.id}`,
      limit: 60,
      windowSeconds: 60,
      headers: params.requestHeaders,
    });
    if (rateLimit) {
      throw new Error('Too many requests');
    }
  }

  const validation = markNotificationReadSchema.safeParse({
    notificationId: params.notificationId,
  });
  if (!validation.success) {
    throw new Error(validation.error.flatten().fieldErrors.notificationId?.[0] || 'Invalid input'); // NOSONAR
  }
  return markAsReadCoreDomain(params);
}

export async function markAllAsReadCore(params: { session: Session | null }) {
  return markAllAsReadCoreDomain(params);
}
