import { getOpenClaimsFilter, getSlaBreachesFilter } from '@/features/admin/kpis/kpi-definitions';
import { deriveClaimSlaPhase } from '@/features/claims/policy/slaPolicy';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { db } from '@interdomestik/database/db';
import { agentClients, claims, serviceUsage, subscriptions } from '@interdomestik/database/schema';
import { and, count, eq } from 'drizzle-orm';

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
    groupBy?: any;
    innerJoin?: any;
    select: any;
  };
}

type OpenClaimStatusCountRow = {
  count: number | string;
  status: ClaimStatus;
};

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
  const assignmentScope = and(
    eq(agentClients.tenantId, tenantId),
    eq(agentClients.agentId, agentId),
    eq(agentClients.status, 'active')
  );

  const activeSubscriptions: Array<{ id: string; userId: string | null }> = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId })
    .from(subscriptions)
    .innerJoin(agentClients, eq(agentClients.memberId, subscriptions.userId))
    .where(
      and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, 'active'), assignmentScope)
    );

  if (activeSubscriptions.length === 0) {
    return emptySummary();
  }

  const activeMemberIds = new Set(
    activeSubscriptions
      .map(subscription => subscription.userId)
      .filter((userId): userId is string => typeof userId === 'string')
  );

  const usageRows: Array<{ memberId: string | null }> = await db
    .select({ memberId: subscriptions.userId })
    .from(serviceUsage)
    .innerJoin(subscriptions, eq(subscriptions.id, serviceUsage.subscriptionId))
    .innerJoin(agentClients, eq(agentClients.memberId, subscriptions.userId))
    .where(
      and(
        eq(serviceUsage.tenantId, tenantId),
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.status, 'active'),
        assignmentScope
      )
    );

  const openClaimStatusCounts: OpenClaimStatusCountRow[] = await db
    .select({ count: count(), status: claims.status })
    .from(claims)
    .innerJoin(agentClients, eq(agentClients.memberId, claims.userId))
    .where(and(eq(claims.tenantId, tenantId), assignmentScope, getOpenClaimsFilter()))
    .groupBy(claims.status);

  const [slaBreaches] = await db
    .select({ count: count() })
    .from(claims)
    .innerJoin(agentClients, eq(agentClients.memberId, claims.userId))
    .where(and(eq(claims.tenantId, tenantId), assignmentScope, getSlaBreachesFilter()));

  const usedMemberIds = new Set(
    usageRows
      .map(row => row.memberId)
      .filter((memberId): memberId is string => typeof memberId === 'string')
  );

  const sla = openClaimStatusCounts.reduce(
    (totals, claimGroup) => {
      const claimCount = Number(claimGroup.count);
      const phase = deriveClaimSlaPhase(claimGroup.status);

      if (phase === 'running') totals.runningCount += claimCount;
      if (phase === 'incomplete') totals.incompleteCount += claimCount;
      if (phase === 'not_applicable') totals.notApplicableCount += claimCount;

      return totals;
    },
    {
      breachCount: Number(slaBreaches?.count ?? 0),
      incompleteCount: 0,
      notApplicableCount: 0,
      runningCount: 0,
    }
  );

  const activatedMembersCount = activeMemberIds.size;
  const membersUsingBenefitsCount = usedMemberIds.size;
  const openClaimsCount = openClaimStatusCounts.reduce(
    (total, claimGroup) => total + Number(claimGroup.count),
    0
  );

  return {
    activatedMembersCount,
    membersUsingBenefitsCount,
    usageRatePercent: Math.round((membersUsingBenefitsCount / activatedMembersCount) * 100),
    openClaimsCount,
    sla,
  };
}

export async function getGroupDashboardSummary(params: {
  agentId: string;
  tenantId: string;
}): Promise<GroupDashboardSummary> {
  return getGroupDashboardSummaryCore(params, { db });
}
