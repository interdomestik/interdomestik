'use server';

import { auth } from '@/lib/auth';
import { claims, db, eq } from '@interdomestik/database';
import { and, count, desc, sql } from 'drizzle-orm';
import { headers } from 'next/headers';

export interface AgentStats {
  total: number;
  new: number;
  inProgress: number;
  completed: number;
}

export async function getAgentDashboardData() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || (session.user.role !== 'agent' && session.user.role !== 'admin')) {
    throw new Error('Unauthorized');
  }

  const agentId = session.user.id;
  const isAgent = session.user.role === 'agent';

  // Base query filter: if role is 'agent', only show their assigned claims
  // If 'admin', show everything for now (or maybe just general overview)
  const whereClause = isAgent ? eq(claims.agentId, agentId) : sql`1=1`;

  // Fetch stats
  const [totalRes] = await db.select({ count: count() }).from(claims).where(whereClause);
  const [newRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(whereClause, eq(claims.status, 'submitted')));
  const [inProgressRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(
      and(whereClause, sql`${claims.status} NOT IN ('resolved', 'rejected', 'submitted', 'draft')`)
    );
  const [completedRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(whereClause, sql`${claims.status} IN ('resolved', 'rejected')`));

  // Fetch recent assigned claims
  const recentClaims = await db.query.claims.findMany({
    where: whereClause,
    orderBy: [desc(claims.updatedAt)],
    limit: 5,
    with: {
      user: true,
    },
  });

  return {
    stats: {
      total: totalRes.count,
      new: newRes.count,
      inProgress: inProgressRes.count,
      completed: completedRes.count,
    },
    recentClaims,
  };
}
