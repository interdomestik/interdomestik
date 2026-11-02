import { getActionContext } from '@/actions/admin-users/context';
import { getBranchCashPendingCount } from '@/features/admin/branches/server/branch-cash-metrics';
import { computeHealthScore } from '@/features/admin/health/health-model';
import { getOpenClaimsFilter, getSlaBreachesFilter } from '@/features/admin/kpis/kpi-definitions';
import { withTenantContext } from '@interdomestik/database';
import { resolveBranchOwner } from '@interdomestik/database';
import { readTenantCurrency } from '@interdomestik/database/tenant-directory';
import { branches, claims, user } from '@interdomestik/database/schema';
import * as lifecycleSql from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { ROLES, scopeFilter } from '@interdomestik/shared-auth';
import * as Sentry from '@sentry/nextjs';
import { and, count, eq, inArray, or } from 'drizzle-orm';

import { getAgentMetrics, getStaffLoad } from './branch-dashboard-v2-metrics';
import type { BranchDashboardV2Data } from './branch-dashboard-v2-types';

export type { BranchDashboardV2Data } from './branch-dashboard-v2-types';

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

        // Tenant Scoping
        const scope = scopeFilter(session);
        let tenantId = scope.tenantId;

        // Super_admin (cross-tenant) first resolves the branch's owning tenant from its id or
        // code; every scope then reads the branch inside one tenant context. Support lookup by
        // either ID (UUID) or code (e.g., branch_mk_b).
        let resolvedOwnerBranchId: string | null = null;
        if (scope.isCrossTenantScope) {
          const owner = await resolveBranchOwner(branchId);
          if (!owner) {
            return null; // Unknown or ambiguous across tenants: allow the 404 handler to take over
          }
          tenantId = owner.tenantId;
          resolvedOwnerBranchId = owner.branchId;
        }
        if (!tenantId) {
          throw new Error('Forbidden: Missing Tenant');
        }
        const scopedTenantId = tenantId;
        const branchResult = await withTenantContext({ tenantId: scopedTenantId }, tx =>
          tx.query.branches.findFirst({
            where: and(
              eq(branches.tenantId, scopedTenantId),
              // A resolved owner binds the exact row; tenant scopes match id or code in-tenant.
              resolvedOwnerBranchId
                ? eq(branches.id, resolvedOwnerBranchId)
                : or(eq(branches.id, branchId), eq(branches.code, branchId))
            ),
          })
        );

        if (!branchResult) {
          return null; // Return null if not found, allowing 404 handler to take over
        }
        const resolvedBranchId = branchResult.id;
        // The tenant directory is not readable under RLS; currency comes from its fixed projection.
        const tenantCurrency = (await readTenantCurrency(tenantId)) ?? 'EUR';

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
          withTenantContext({ tenantId }, tx =>
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

          withTenantContext({ tenantId }, tx =>
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

          withTenantContext({ tenantId }, tx =>
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

          withTenantContext({ tenantId }, tx =>
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

          withTenantContext({ tenantId }, tx =>
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
            currency: tenantCurrency,
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
