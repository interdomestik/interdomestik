import {
  and,
  claimMessages,
  claims,
  inArray,
  sql,
  eq,
  withTenantContext,
  type TenantTransaction,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter } from '@interdomestik/shared-auth';
import { isNull, type SQL } from 'drizzle-orm';

import type { UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { buildUserConditions, type GetUsersFilters } from './user-filters';

export type { GetUsersFilters } from './user-filters';

export async function getUsersCore(params: {
  session: UserSession | null;
  filters?: GetUsersFilters;
  includeUnreadCounts?: boolean;
}) {
  const { session, filters, includeUnreadCounts = true } = params;
  const adminSession = await requireTenantAdminSession(session);
  const scope = scopeFilter(adminSession);

  // Build filter conditions
  const conditions = buildUserConditions(scope, filters);

  const userConditions = conditions.length
    ? and(...conditions.filter((c): c is SQL<unknown> => c !== undefined && c !== null))
    : undefined;

  return withTenantContext(
    {
      tenantId: scope.tenantId,
      accessTenantId: scope.accessTenantId,
      role: adminSession.user.role,
    },
    async tx => {
      const users = await tx.query.user.findMany({
        where: (t, { eq, and }) => withTenant(scope.tenantId, t.tenantId, userConditions),
        orderBy: (users, { desc }) => [desc(users.createdAt)],
        with: { agent: true },
      });

      const unreadByUser =
        includeUnreadCounts && users.length
          ? await fetchUnreadCounts(
              tx,
              scope.tenantId,
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
    }
  );
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
