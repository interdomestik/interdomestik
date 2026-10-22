import { getAgentMetrics, getStaffLoad } from './branch-workload-metrics';
import { getActionContext } from '@/actions/admin-users/context';
import { getBranchCashPendingCount } from '@/features/admin/branches/server/branch-cash-metrics';
import { HealthProfile, computeHealthScore } from '@/features/admin/health/health-model';
import { getOpenClaimsFilter, getSlaBreachesFilter } from '@/features/admin/kpis/kpi-definitions';
import { withTenantContext } from '@interdomestik/database';
import { readAuthorizedBranchDashboardMetadata } from '@/server/auth/branch-dashboard-metadata';
import { claims, user } from '@interdomestik/database/schema';
import * as lifecycleSql from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { ROLES } from '@interdomestik/shared-auth';
import * as Sentry from '@sentry/nextjs';
import { and, count, eq, inArray } from 'drizzle-orm';

export interface BranchDashboardV2Data {
  branch: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    currency: string;
  };
  health: HealthProfile;
  kpis: {
    openClaims: number;
    cashPending: number;
    slaBreaches: number;
    totalMembers: number;
    totalAgents: number;
  };
  pipeline: {
    status: string;
    count: number;
  }[];
  agentHealth: {
    id: string;
    name: string;
    health: HealthProfile;
    metrics: {
      openClaims: number;
      cashPending: number;
      slaBreaches: number;
    };
  }[];
  staffLoad: {
    id: string;
    name: string;
    workload: number; // in-progress claims
    severity: 'healthy' | 'attention' | 'urgent'; // derived from workload only
  }[];
}

export async function getBranchDashboardV2Data(
  branchId: string
): Promise<BranchDashboardV2Data | null> {
  return Sentry.withServerActionInstrumentation(
    'getBranchDashboardV2Data',
    { recordResponse: true },
    async () => {
      try {
        const { session } = await getActionContext();
        if (!session?.user) throw new Error('Unauthorized');

        // RBAC Checks
        const userRole = session.user.role;

        if (userRole === 'user' || userRole === ROLES.agent) {
          throw new Error('Forbidden');
        }

        if (userRole === ROLES.branch_manager) {
          const assignedBranchId = session.user.branchId?.trim();
          if (!assignedBranchId || assignedBranchId !== branchId) {
            const error = new Error('Forbidden: Branch Scope');
            Sentry.captureException(error, { extra: { assignedBranchId, branchId } });
            return null;
          }
        }

        const branchResult = await readAuthorizedBranchDashboardMetadata(branchId);
        if (!branchResult) return null;
        const tenantId = branchResult.tenantId;
        const resolvedBranchId = branchResult.id;
        const tenantMetadata = { currency: branchResult.currency };

        // Parallel Data Fetching
        const [
          openClaimsCount,
          cashPendingCount,
          slaBreachesCount,
          totalAgentsCount,
          totalMembersCount,
          pipelineCounts,
          agentsData,
          staffData,
        ] = await Promise.all([
          withTenantContext({ tenantId: tenantId }, tx =>
            tx
              .select({ count: count() })
              .from(claims)
              .where(
                and(
                  eq(claims.branchId, resolvedBranchId),
                  eq(claims.tenantId, tenantId),
                  getOpenClaimsFilter()
                )
              )
          ),

          getBranchCashPendingCount({ tenantId, branchId: resolvedBranchId }),

          withTenantContext({ tenantId: tenantId }, tx =>
            tx
              .select({ count: count() })
              .from(claims)
              .where(
                and(
                  eq(claims.branchId, resolvedBranchId),
                  eq(claims.tenantId, tenantId),
                  getSlaBreachesFilter()
                )
              )
          ),

          withTenantContext({ tenantId: tenantId }, tx =>
            tx
              .select({ count: count() })
              .from(user)
              .where(
                and(
                  eq(user.branchId, resolvedBranchId),
                  eq(user.tenantId, tenantId),
                  eq(user.role, 'agent')
                )
              )
          ),

          withTenantContext({ tenantId: tenantId }, tx =>
            tx
              .select({ count: count() })
              .from(user)
              .where(
                and(
                  eq(user.branchId, resolvedBranchId),
                  eq(user.tenantId, tenantId),
                  inArray(user.role, ['user', 'member'])
                )
              )
          ),

          withTenantContext({ tenantId: tenantId }, tx =>
            tx
              .select({ status: lifecycleSql.claimLifecycleStatusSql(), count: count() })
              .from(claims)
              .where(and(eq(claims.branchId, resolvedBranchId), eq(claims.tenantId, tenantId)))
              .groupBy(lifecycleSql.claimLifecycleStatusSql())
          ),

          getAgentMetrics(resolvedBranchId, tenantId),

          getStaffLoad(resolvedBranchId, tenantId),
        ]);

        // Compute Branch Health
        const kpis = {
          openClaims: openClaimsCount[0]?.count ?? 0,
          cashPending: cashPendingCount,
          slaBreaches: slaBreachesCount[0]?.count ?? 0,
          isActive: branchResult.isActive,
          totalAgents: totalAgentsCount[0]?.count ?? 0,
          totalMembers: totalMembersCount[0]?.count ?? 0,
        };

        const branchHealth = computeHealthScore(kpis);

        return {
          branch: {
            id: branchResult.id,
            name: branchResult.name,
            code: branchResult.code ?? '',
            isActive: branchResult.isActive,
            currency: tenantMetadata.currency,
          },
          health: {
            ...branchHealth,
            count: branchHealth.score,
          },
          kpis,
          pipeline: pipelineCounts.map(p => ({ status: p.status ?? 'unknown', count: p.count })),
          agentHealth: agentsData.map(a => {
            const h = computeHealthScore({
              openClaims: a.openClaims,
              cashPending: a.cashPending,
              slaBreaches: a.slaBreaches,
              isActive: true, // Agents assumed active for scoring context
            });
            return {
              id: a.id,
              name: a.name,
              health: { ...h, count: h.score },
              metrics: {
                openClaims: a.openClaims,
                cashPending: a.cashPending,
                slaBreaches: a.slaBreaches,
              },
            };
          }),
          staffLoad: staffData,
        };
      } catch (error) {
        console.error('getBranchDashboardV2Data error:', error);
        Sentry.captureException(error, { extra: { branchId } });
        return null;
      }
    }
  );
}
