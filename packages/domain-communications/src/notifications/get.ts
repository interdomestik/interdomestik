import { db } from '@interdomestik/database';
import { notifications } from '@interdomestik/database/schema';
import { desc, eq } from 'drizzle-orm';

import type { Session } from '../types';

export async function getNotificationsCore(params: { session: Session | null; limit?: number }) {
  const { session, limit = 20 } = params;

  const user = session?.user;
  if (!user?.id) {
    throw new Error('Not authenticated');
  }

  const tenantId = user.tenantId ?? 'tenant_mk';
  return db.query.notifications.findMany({
    where: (table, { and, eq }) => and(eq(table.userId, user.id), eq(table.tenantId, tenantId)),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
}
