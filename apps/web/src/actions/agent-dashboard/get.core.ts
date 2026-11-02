import { isStaffOrAdmin } from '@/lib/roles';
import { claims, eq } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  claimLifecycleStatusIn,
  claimLifecycleStatusIs,
} from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, count, desc, sql } from 'drizzle-orm';

import type { Session } from './context';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function getAgentDashboardDataCore(params: {
  session: Session | null;
  authority: TenantAuthority | null;
}) {
  const { session, authority } = params;

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

  try {
    ensureTenantId(session);
  } catch {
    throw new Error('Missing tenantId');
  }
  if (!authority) {
    throw new Error('Unauthorized');
  }
  const { tenantId } = readTenantAuthority(authority);

  const completedStatuses: readonly ClaimStatus[] = ['resolved', 'rejected'];
  const newStatus: ClaimStatus = 'submitted';
  const inProgressStatuses = CLAIM_STATUSES.filter(
    status => status !== 'draft' && status !== newStatus && !completedStatuses.includes(status)
  );

  const [totalRes] = await withTenantAuthority(authority, async tx =>
    tx.select({ count: count() }).from(claims).where(eq(claims.tenantId, tenantId))
  );
  const [newRes] = await withTenantAuthority(authority, async tx =>
    tx
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIs(newStatus)))
  );

  const inProgressCondition =
    inProgressStatuses.length > 0 ? claimLifecycleStatusIn(inProgressStatuses) : sql`false`;

  const [inProgressRes] = await withTenantAuthority(authority, async tx =>
    tx
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), inProgressCondition))
  );
  const [completedRes] = await withTenantAuthority(authority, async tx =>
    tx
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIn(completedStatuses)))
  );

  const recentClaims = await withTenantAuthority(authority, async tx =>
    tx.query.claims.findMany({
      where: eq(claims.tenantId, tenantId),
      orderBy: [desc(claims.updatedAt)],
      limit: 5,
      with: { user: true },
    })
  );

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
