import {
  getCashPendingFilter,
  getOpenClaimsFilter,
  getSlaBreachesFilter,
} from '@/features/admin/kpis/kpi-definitions';
import { db } from '@interdomestik/database';
import { branches, claims, leadPaymentAttempts, user } from '@interdomestik/database/schema';
import { and, count, eq, inArray } from 'drizzle-orm';

export async function fetchKpis(tenantId: string) {
  // 1. Branch Count
  const [branchesData] = await db
    .select({ count: count() })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  // 2. Agent Count (users with role='agent')
  const [agentsData] = await db
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.role, 'agent')));

  // 3. Member Count (users with role='user' or 'member')
  const [membersData] = await db
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), inArray(user.role, ['user', 'member'])));

  // 4. Open Claims
  const [openClaimsData] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), getOpenClaimsFilter()));

  // 5. Cash Pending (Needs verification)
  const [cashPendingData] = await db
    .select({ count: count() })
    .from(leadPaymentAttempts)
    .where(and(eq(leadPaymentAttempts.tenantId, tenantId), getCashPendingFilter()));

  // 6. SLA Breaches (claims open > 30 days still in 'submitted')
  const [slaBreachesData] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), getSlaBreachesFilter()));

  return {
    branches: branchesData?.count ?? 0,
    agents: agentsData?.count ?? 0,
    members: membersData?.count ?? 0,
    claimsOpen: openClaimsData?.count ?? 0,
    cashPending: cashPendingData?.count ?? 0,
    slaBreaches: slaBreachesData?.count ?? 0,
  };
}
