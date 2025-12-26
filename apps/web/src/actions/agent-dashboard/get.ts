import { isStaffOrAdmin } from '@/lib/roles';
import { claims, db, eq } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { and, count, desc, inArray, sql } from 'drizzle-orm';

import type { Session } from './context';

export async function getAgentDashboardDataCore(params: { session: Session | null }) {
  const { session } = params;

  if (!session) {
    throw new Error('Unauthorized');
  }

  if (session.user.role === 'agent') {
    return {
      stats: { total: 0, new: 0, inProgress: 0, completed: 0 },
      recentClaims: [],
    };
  }

  if (!isStaffOrAdmin(session.user.role)) {
    throw new Error('Unauthorized');
  }

  const whereClause = sql`1=1`;

  const completedStatuses: readonly ClaimStatus[] = ['resolved', 'rejected'];
  const newStatus: ClaimStatus = 'submitted';
  const inProgressStatuses = CLAIM_STATUSES.filter(
    status => status !== 'draft' && status !== newStatus && !completedStatuses.includes(status)
  );

  const [totalRes] = await db.select({ count: count() }).from(claims).where(whereClause);
  const [newRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(whereClause, eq(claims.status, newStatus)));

  const inProgressCondition =
    inProgressStatuses.length > 0 ? inArray(claims.status, inProgressStatuses) : sql`false`;

  const [inProgressRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(whereClause, inProgressCondition));
  const [completedRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(whereClause, inArray(claims.status, completedStatuses)));

  const recentClaims = await db.query.claims.findMany({
    where: whereClause,
    orderBy: [desc(claims.updatedAt)],
    limit: 5,
    with: { user: true },
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
