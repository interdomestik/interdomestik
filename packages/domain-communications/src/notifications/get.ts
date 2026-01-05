import { db } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { notifications } from '@interdomestik/database/schema';
import { desc, eq } from 'drizzle-orm';

import { ensureTenantId } from '@interdomestik/shared-auth';
import type { Session } from '../types';

export async function getNotificationsCore(params: { session: Session | null; limit?: number }) {
  const { session, limit = 20 } = params;

  const user = session?.user;
  if (!user?.id) {
    throw new Error('Not authenticated');
  }

  const tenantId = ensureTenantId(session);
  return db.query.notifications.findMany({
    where: (table, { eq }) => withTenant(tenantId, table.tenantId, eq(table.userId, user.id)),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
}
