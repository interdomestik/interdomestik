'use server';

import { auth } from '@/lib/auth';
import { agentClients, db, eq, ilike, inArray, or, user } from '@interdomestik/database';
import { and, type SQL } from 'drizzle-orm';
import { headers } from 'next/headers';

export async function getAgentUsers(filters?: { search?: string }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || (session.user.role !== 'agent' && session.user.role !== 'admin')) {
    throw new Error('Unauthorized');
  }

  const conditions: SQL[] = [eq(user.role, 'user')];

  if (session.user.role === 'agent') {
    const links = await db
      .select({ memberId: agentClients.memberId })
      .from(agentClients)
      .where(and(eq(agentClients.agentId, session.user.id), eq(agentClients.status, 'active')));
    const memberIds = links.map(link => link.memberId);

    if (memberIds.length === 0) {
      return [];
    }

    conditions.push(inArray(user.id, memberIds) as SQL);
  }

  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(ilike(user.name, term), ilike(user.email, term)));
  }

  const users = await db.query.user.findMany({
    where: and(...conditions),
    orderBy: (users, { desc }) => [desc(users.createdAt)],
    with: {
      agent: true,
    },
  });

  return users.map(userRow => ({
    ...userRow,
    unreadCount: 0,
    alertLink: null,
  }));
}
