import { notifications } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { desc } from 'drizzle-orm';

import type { Session } from '../types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getNotificationsCore(params: {
  session: Session | null;
  authority: TenantAuthority | null;
  limit?: number;
}) {
  const { session, authority, limit = 20 } = params;

  const user = session?.user;
  if (!user?.id) {
    throw new Error('Not authenticated');
  }

  if (!authority) {
    throw new Error('Not authenticated');
  }

  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    tx.query.notifications.findMany({
      where: (table, { eq }) => withTenant(tenantId, table.tenantId, eq(table.userId, user.id)),
      orderBy: [desc(notifications.createdAt)],
      limit,
    })
  );
}
