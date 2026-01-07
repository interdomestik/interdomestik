import { and, claimMessages, claims, db, desc, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter, type SessionWithTenant } from '@interdomestik/shared-auth';
import { isNull, type SQL } from 'drizzle-orm';

import type { UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { buildUserConditions, type GetUsersFilters } from './user-filters';

export { type GetUsersFilters };

export async function getUsersCore(params: {
  session: UserSession | null;
  filters?: GetUsersFilters;
}) {
  const { session, filters } = params;
  const adminSession = await requireTenantAdminSession(session);
  const scope = scopeFilter(adminSession as SessionWithTenant);

  // Build filter conditions
  const conditions = buildUserConditions(scope, filters);

  const userConditions = conditions.length
    ? and(...conditions.filter((c): c is SQL<unknown> => c !== undefined && c !== null))
    : undefined;

  const users = await db.query.user.findMany({
    where: (t, { eq, and }) => withTenant(scope.tenantId!, t.tenantId, userConditions),
    orderBy: (users, { desc }) => [desc(users.createdAt)],
    with: {
      agent: true,
    },
  });

  const unreadByUser = await fetchUnreadCounts(scope.tenantId!);

  const alertBase = '/admin/claims/';

  return users.map(userRow => {
    const unread = unreadByUser.get(userRow.id);
    return {
      ...userRow,
      unreadCount: unread?.count ?? 0,
      unreadClaimId: unread?.claimId ?? null,
      alertLink: unread ? `${alertBase}${unread.claimId}` : null,
    };
  });
}

async function fetchUnreadCounts(tenantId: string) {
  const unreadByUser = new Map<string, { count: number; claimId: string }>();

  const unreadConditions = [
    isNull(claimMessages.readAt),
    eq(claimMessages.senderId, claims.userId),
  ];

  const unreadRows = await db
    .select({
      userId: claims.userId,
      claimId: claims.id,
    })
    .from(claimMessages)
    .innerJoin(claims, eq(claimMessages.claimId, claims.id))
    .where(withTenant(tenantId, claims.tenantId, and(...unreadConditions)))
    .orderBy(desc(claimMessages.createdAt));

  for (const row of unreadRows) {
    const existing = unreadByUser.get(row.userId);
    if (existing) {
      existing.count += 1;
    } else {
      unreadByUser.set(row.userId, { count: 1, claimId: row.claimId });
    }
  }
  return unreadByUser;
}
