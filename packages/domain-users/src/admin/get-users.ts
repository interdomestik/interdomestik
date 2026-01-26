import { and, claimMessages, claims, db, desc, eq, inArray } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter } from '@interdomestik/shared-auth';
import { isNull, not, type SQL } from 'drizzle-orm';

import type { UserSession } from '../types';
import { requireMembersReadSession } from './access';
import { buildUserConditions, type GetUsersFilters } from './user-filters';

export type { GetUsersFilters } from './user-filters';

export async function getUsersCore(params: {
  session: UserSession | null;
  filters?: GetUsersFilters;
}) {
  const { session, filters } = params;
  const authSession = await requireMembersReadSession(session);
  const scope = scopeFilter(authSession);

  // Build filter conditions
  const conditions = buildUserConditions(scope, filters);

  const userConditions = conditions.length
    ? and(...conditions.filter((c): c is SQL<unknown> => c !== undefined && c !== null))
    : undefined;

  const users = await db.query.user.findMany({
    where: (t, { eq, and }) => withTenant(scope.tenantId, t.tenantId, userConditions),
    orderBy: (users, { desc }) => [desc(users.createdAt)],
    with: {
      agent: true,
    },
  });

  const unreadByUser = await fetchUnreadCounts(scope.tenantId);
  const activeClaimsByUser = await fetchActiveClaimsCounts(scope.tenantId);

  const alertBase = '/admin/claims/';

  return users.map(userRow => {
    const unread = unreadByUser.get(userRow.id);
    return {
      ...userRow,
      unreadCount: unread?.count ?? 0,
      unreadClaimId: unread?.claimId ?? null,
      alertLink: unread ? `${alertBase}${unread.claimId}` : null,
      activeClaimsCount: activeClaimsByUser.get(userRow.id) ?? 0,
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

async function fetchActiveClaimsCounts(tenantId: string) {
  const counts = new Map<string, number>();

  const activeClaims = await db.query.claims.findMany({
    where: (c, { and, eq, not, inArray }) =>
      and(eq(c.tenantId, tenantId), not(inArray(c.status, ['resolved', 'rejected', 'draft']))),
    columns: {
      userId: true,
    },
  });

  for (const row of activeClaims) {
    if (!row.userId) continue;
    counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1);
  }

  return counts;
}
