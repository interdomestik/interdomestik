import { getOpenClaimsFilter, getSlaBreachesFilter } from '@/features/admin/kpis/kpi-definitions';
import { deriveClaimSlaPhase } from '@/features/claims/policy/slaPolicy';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { db } from '@interdomestik/database/db';
import { claims, serviceUsage, subscriptions } from '@interdomestik/database/schema';
import { and, count, eq, inArray } from 'drizzle-orm';

export type GroupDashboardSummary = {
  activatedMembersCount: number;
  membersUsingBenefitsCount: number;
  usageRatePercent: number;
  openClaimsCount: number;
  sla: {
    breachCount: number;
    incompleteCount: number;
    notApplicableCount: number;
    runningCount: number;
  };
};

export interface GroupDashboardSummaryServices {
  db: {
    select: any;
  };
}

function emptySummary(): GroupDashboardSummary {
  return {
    activatedMembersCount: 0,
    membersUsingBenefitsCount: 0,
    usageRatePercent: 0,
    openClaimsCount: 0,
    sla: {
      breachCount: 0,
      incompleteCount: 0,
      notApplicableCount: 0,
      runningCount: 0,
    },
  };
}

export async function getGroupDashboardSummaryCore(
  params: { agentId: string; tenantId: string },
  services: GroupDashboardSummaryServices
): Promise<GroupDashboardSummary> {
  const { agentId, tenantId } = params;
  const { db } = services;

  const activeSubscriptions: Array<{ id: string }> = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.agentId, agentId),
        eq(subscriptions.status, 'active')
      )
    );

  if (activeSubscriptions.length === 0) {
    return emptySummary();
  }

  const subscriptionIds = activeSubscriptions.map(subscription => subscription.id);

  const usageRows: Array<{ subscriptionId: string | null }> = await db
    .select({ subscriptionId: serviceUsage.subscriptionId })
    .from(serviceUsage)
    .where(
      and(
        eq(serviceUsage.tenantId, tenantId),
        inArray(serviceUsage.subscriptionId, subscriptionIds)
      )
    );

  const openClaims: Array<{ status: ClaimStatus }> = await db
    .select({ status: claims.status })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.agentId, agentId), getOpenClaimsFilter()));

  const [slaBreaches] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.tenantId, tenantId), eq(claims.agentId, agentId), getSlaBreachesFilter()));

  const usedSubscriptionIds = new Set(
    usageRows
      .map(row => row.subscriptionId)
      .filter((subscriptionId): subscriptionId is string => typeof subscriptionId === 'string')
  );

  const sla = openClaims.reduce(
    (totals, claim) => {
      const phase = deriveClaimSlaPhase(claim.status);

      if (phase === 'running') totals.runningCount += 1;
      if (phase === 'incomplete') totals.incompleteCount += 1;
      if (phase === 'not_applicable') totals.notApplicableCount += 1;

      return totals;
    },
    {
      breachCount: Number(slaBreaches?.count ?? 0),
      incompleteCount: 0,
      notApplicableCount: 0,
      runningCount: 0,
    }
  );

  const activatedMembersCount = activeSubscriptions.length;
  const membersUsingBenefitsCount = usedSubscriptionIds.size;

  return {
    activatedMembersCount,
    membersUsingBenefitsCount,
    usageRatePercent: Math.round((membersUsingBenefitsCount / activatedMembersCount) * 100),
    openClaimsCount: openClaims.length,
    sla,
  };
}

export async function getGroupDashboardSummary(params: {
  agentId: string;
  tenantId: string;
}): Promise<GroupDashboardSummary> {
  return getGroupDashboardSummaryCore(params, { db });
}
