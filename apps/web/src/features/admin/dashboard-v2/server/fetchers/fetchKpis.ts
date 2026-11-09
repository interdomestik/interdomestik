import {
  getCashPendingFilter,
  getOpenClaimsFilter,
  getSlaBreachesFilter,
} from '@/features/admin/kpis/kpi-definitions';

import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { branches, claims, leadPaymentAttempts, user } from '@interdomestik/database/schema';
import { getTenantMembershipLifecycleCounts } from '@interdomestik/domain-membership-billing';
import { and, count, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function fetchKpis(authority: TenantAuthority): Promise<{
  branches: number;
  agents: number;
  members: number;
  claimsOpen: number;
  cashPending: number;
  slaBreaches: number;
}> {
  const { tenantId } = readTenantAuthority(authority);
  // 1. Branch Count
  const [branchesData] = await withTenantAuthority(authority, tx =>
    tx.select({ count: count() }).from(branches).where(eq(branches.tenantId, tenantId))
  );

  // 2. Agent Count (users with role='agent')
  const [agentsData] = await withTenantAuthority(authority, tx =>
    tx
      .select({ count: count() })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.role, 'agent')))
  );

  // 3. Effective member count, including sponsorship, through the coverage-set reporting boundary.
  const lifecycleCounts = await getTenantMembershipLifecycleCounts({ authority });

  // 4. Open Claims
  const [openClaimsData] = await withTenantAuthority(authority, tx =>
    tx
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), getOpenClaimsFilter()))
  );

  // 5. Cash Pending (Needs verification)
  const [cashPendingData] = await withTenantAuthority(authority, tx =>
    tx
      .select({ count: count() })
      .from(leadPaymentAttempts)
      .where(and(eq(leadPaymentAttempts.tenantId, tenantId), getCashPendingFilter()))
  );

  // 6. SLA Breaches (claims open > 30 days still in 'submitted')
  const [slaBreachesData] = await withTenantAuthority(authority, tx =>
    tx
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), getSlaBreachesFilter()))
  );

  return {
    branches: branchesData?.count ?? 0,
    agents: agentsData?.count ?? 0,
    members: lifecycleCounts.accessActive,
    claimsOpen: openClaimsData?.count ?? 0,
    cashPending: cashPendingData?.count ?? 0,
    slaBreaches: slaBreachesData?.count ?? 0,
  };
}
