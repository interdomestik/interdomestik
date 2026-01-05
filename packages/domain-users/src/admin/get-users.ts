import {
  and,
  claimMessages,
  claims,
  db,
  eq,
  ilike,
  inArray,
  or,
  user,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { scopeFilter, type SessionWithTenant } from '@interdomestik/shared-auth';
import { SQL, desc, isNotNull, isNull } from 'drizzle-orm';

import type { UserSession } from '../types';
import { requireTenantAdminSession } from './access';

export type GetUsersFilters = {
  search?: string;
  role?: string;
  assignment?: string;
};

export async function getUsersCore(params: {
  session: UserSession | null;
  filters?: GetUsersFilters;
}) {
  const { session, filters } = params;
  const adminSession = await requireTenantAdminSession(session);

  const conditions: SQL<unknown>[] = [];

  // Apply Scope Filter (Tenant + Branch + Agent)
  const scope = scopeFilter(adminSession as unknown as SessionWithTenant);
  const tenantId = scope.tenantId;

  if (!scope.isFullTenantScope) {
    if (scope.branchId) {
      conditions.push(eq(user.branchId, scope.branchId));
    }
    if (scope.agentId) {
      conditions.push(eq(user.agentId, scope.agentId));
    }
  }
  const roleFilter = filters?.role && filters.role !== 'all' ? filters.role : null;
  const assignmentFilter =
    filters?.assignment && filters.assignment !== 'all' ? filters.assignment : null;

  if (roleFilter) {
    if (roleFilter.includes(',')) {
      conditions.push(inArray(user.role, roleFilter.split(',')));
    } else {
      conditions.push(eq(user.role, roleFilter));
    }
  }

  if (assignmentFilter === 'assigned') {
    conditions.push(isNotNull(user.agentId));
  }

  if (assignmentFilter === 'unassigned') {
    conditions.push(isNull(user.agentId));
  }

  if (filters?.search) {
    const term = `%${filters.search}%`;
    const searchFilter = or(ilike(user.name, term), ilike(user.email, term));
    if (searchFilter) {
      conditions.push(searchFilter);
    }
  }

  // Ensure tenant scoping is enforced via helper
  const userConditions = conditions.length
    ? and(...conditions.filter((c): c is SQL<unknown> => c !== undefined && c !== null))
    : undefined;

  // Use withTenant to enforce tenant boundary, replacing manual push
  // conditions.push(eq(user.tenantId, tenantId)); <-- Removed manual push

  const users = await db.query.user.findMany({
    where: (t, { eq, and }) => withTenant(tenantId, t.tenantId, userConditions),
    orderBy: (users, { desc }) => [desc(users.createdAt)],
    with: {
      agent: true,
    },
  });

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
