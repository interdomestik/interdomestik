import { db } from '@interdomestik/database';
import { notifications } from '@interdomestik/database/schema';
import { desc, eq } from 'drizzle-orm';

import type { Session } from './context';

export async function getNotificationsCore(params: { session: Session | null; limit?: number }) {
  const { session, limit = 20 } = params;

  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  return db.query.notifications.findMany({
    where: eq(notifications.userId, session.user.id),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
}
