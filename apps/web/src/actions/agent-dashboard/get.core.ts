import { isStaffOrAdmin } from '@/lib/roles';
import { claims, db, eq } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, count, desc, inArray, sql } from 'drizzle-orm';

import type { Session } from './context';

export async function getAgentDashboardDataCore(params: { session: Session | null }) {
  const { session } = params;

  if (!session?.user) {
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

  let tenantId: string;
  try {
    tenantId = ensureTenantId(session);
  } catch {
    throw new Error('Missing tenantId');
  }

  const completedStatuses: readonly ClaimStatus[] = ['resolved', 'rejected'];
  const newStatus: ClaimStatus = 'submitted';
  const inProgressStatuses = CLAIM_STATUSES.filter(
    status => status !== 'draft' && status !== newStatus && !completedStatuses.includes(status)
  );

  const [totalRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.tenantId, tenantId));
  const [newRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.status, newStatus)));

  const inProgressCondition =
    inProgressStatuses.length > 0 ? inArray(claims.status, inProgressStatuses) : sql`false`;

  const [inProgressRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), inProgressCondition));
  const [completedRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), inArray(claims.status, completedStatuses)));

  const recentClaims = await db.query.claims.findMany({
    where: eq(claims.tenantId, tenantId),
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
