import {
  and,
  claimMessages,
  claims,
  inArray,
  sql,
  eq,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter } from '@interdomestik/shared-auth';
import { isNull, type SQL } from 'drizzle-orm';

import type { UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { buildUserConditions, type GetUsersFilters } from './user-filters';

export type { GetUsersFilters } from './user-filters';

export async function getUsersCore(params: {
  session: UserSession | null;
  authority: TenantAuthority;
  filters?: GetUsersFilters;
  includeUnreadCounts?: boolean;
}) {
  const { session, authority, filters, includeUnreadCounts = true } = params;
  const adminSession = await requireTenantAdminSession(session, authority);
  const scope = scopeFilter(adminSession);
  // Rows are read under the session authority; a scope naming any other tenant fails closed.
  const { tenantId } = readTenantAuthority(authority);
  if (scope.tenantId !== tenantId) {
    throw new Error('Unauthorized');
  }

  // Build filter conditions
  const conditions = buildUserConditions(scope, filters);

  const userConditions = conditions.length
    ? and(...conditions.filter((c): c is SQL<unknown> => c !== undefined && c !== null))
    : undefined;

  return withTenantAuthority(authority, async tx => {
    const users = await tx.query.user.findMany({
      where: (t, { eq, and }) => withTenant(tenantId, t.tenantId, userConditions),
      orderBy: (users, { desc }) => [desc(users.createdAt)],
    });

    const unreadByUser =
      includeUnreadCounts && users.length
        ? await fetchUnreadCounts(
            tx,
            tenantId,
            users.map(user => user.id)
          )
        : new Map<string, { count: number; claimId: string }>();
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
  });
}

async function fetchUnreadCounts(tx: TenantTransaction, tenantId: string, userIds: string[]) {
  // Window aggregation and DISTINCT ON return one row per visible user, preserving
  // the claim with the newest unread member message without transferring every message.
  const unreadRows = await tx
    .selectDistinctOn([claims.userId], {
      userId: claims.userId,
      claimId: claims.id,
      count: sql<number>`count(*) over (partition by ${claims.userId})`.mapWith(Number),
    })
    .from(claimMessages)
    .innerJoin(claims, eq(claimMessages.claimId, claims.id))
    .where(
      withTenant(
        tenantId,
        claims.tenantId,
        and(
          inArray(claims.userId, userIds),
          isNull(claimMessages.readAt),
          eq(claimMessages.senderId, claims.userId)
        )
      )
    )
    .orderBy(claims.userId, sql`${claimMessages.createdAt} desc`, sql`${claimMessages.id} desc`);
  return new Map(unreadRows.map(row => [row.userId, { count: row.count, claimId: row.claimId }]));
}
