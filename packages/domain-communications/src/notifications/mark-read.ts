import { db } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { notifications } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import type { Session } from '../types';

export async function markAsReadCore(params: { session: Session | null; notificationId: string }) {
  const { session, notificationId } = params;

  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  const tenantId = ensureTenantId(session);
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      withTenant(
        tenantId,
        notifications.tenantId,
        and(eq(notifications.id, notificationId), eq(notifications.userId, session.user.id))
      )
    );

  return { success: true };
}

export async function markAllAsReadCore(params: { session: Session | null }) {
  const { session } = params;

  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  const tenantId = ensureTenantId(session);
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(withTenant(tenantId, notifications.tenantId, eq(notifications.userId, session.user.id)));

  return { success: true };
}
