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
import { SQL, desc, isNotNull, isNull } from 'drizzle-orm';

import { requireAdminSession } from './access';
import type { Session } from './context';

export type GetUsersFilters = {
  search?: string;
  role?: string;
  assignment?: string;
};

export async function getUsersCore(params: {
  session: NonNullable<Session> | null;
  filters?: GetUsersFilters;
}) {
  const { session, filters } = params;
  requireAdminSession(session);

  const conditions: SQL<unknown>[] = [];
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

  const users = await db.query.user.findMany({
    where: conditions.length
      ? and(...conditions.filter((c): c is SQL<unknown> => c !== undefined && c !== null))
      : undefined,
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
    .where(and(...unreadConditions))
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
