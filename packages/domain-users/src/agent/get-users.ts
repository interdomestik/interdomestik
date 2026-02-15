import { agentClients, db, eq, ilike, inArray, or, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, type SQL } from 'drizzle-orm';

import { ensureTenantId } from '@interdomestik/shared-auth';
import type { UserSession } from '../types';

type Filters = {
  search?: string;
  limit?: number;
  offset?: number;
};

export async function getAgentUsersCore(params: {
  session: UserSession | null;
  filters?: Filters;
}) {
  const { session, filters } = params;

  if (!session || (session.user.role !== 'agent' && session.user.role !== 'admin')) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);

  const conditions: SQL[] = [inArray(user.role, ['user', 'member'])];

  if (session.user.role === 'agent') {
    const links = await db
      .select({ memberId: agentClients.memberId })
      .from(agentClients)
      .where(
        withTenant(
          tenantId,
          agentClients.tenantId,
          and(eq(agentClients.agentId, session.user.id), eq(agentClients.status, 'active'))
        )
      );

    const memberIds = links.map(link => link.memberId);

    if (memberIds.length === 0) {
      return [];
    }

    conditions.push(inArray(user.id, memberIds));
  }

  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(ilike(user.name, term), ilike(user.email, term))!);
  }

  const userConditions = conditions.length ? and(...conditions) : undefined;
  const users = await db.query.user.findMany({
    where: withTenant(tenantId, user.tenantId, userConditions),
    orderBy: (users, { desc }) => [desc(users.createdAt)],
    limit: filters?.limit,
    offset: filters?.offset,
    with: {
      agent: true,
      subscriptions: {
        orderBy: (subs, { desc: descFn }) => [descFn(subs.createdAt)],
        limit: 1,
      },
    },
  });

  return users.map(userRow => ({
    ...userRow,
    unreadCount: 0,
    alertLink: null,
    subscription: userRow.subscriptions?.[0] || null,
  }));
}
