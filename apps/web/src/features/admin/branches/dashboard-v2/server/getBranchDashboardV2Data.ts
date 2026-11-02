import { getActionContext } from '@/actions/admin-users/context';
import {
  getBranchCashPendingByAgent,
  getBranchCashPendingCount,
} from '@/features/admin/branches/server/branch-cash-metrics';
import { HealthProfile, computeHealthScore } from '@/features/admin/health/health-model';
import { getOpenClaimsFilter, getSlaBreachesFilter } from '@/features/admin/kpis/kpi-definitions';
import { withTenantContext } from '@interdomestik/database';
import { resolveBranchOwner } from '@interdomestik/database/platform-directory';
import { readTenantCurrency } from '@interdomestik/database/tenant-directory';
import { branches, claims, user } from '@interdomestik/database/schema';
import * as lifecycleSql from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { ROLES, scopeFilter } from '@interdomestik/shared-auth';
import * as Sentry from '@sentry/nextjs';
import { and, count, eq, inArray, or } from 'drizzle-orm';

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

        // Tenant Scoping
        const scope = scopeFilter(session);
        let tenantId = scope.tenantId;

        // Super_admin (cross-tenant) first resolves the branch's owning tenant from its id or
        // code; every scope then reads the branch inside one tenant context. Support lookup by
        // either ID (UUID) or code (e.g., branch_mk_b).
        if (scope.isCrossTenantScope) {
          const owner = await resolveBranchOwner(branchId);
          if (!owner) {
            return null; // Unknown or ambiguous across tenants: allow the 404 handler to take over
          }
          tenantId = owner.tenantId;
        }
        if (!tenantId) {
          throw new Error('Forbidden: Missing Tenant');
        }
        const scopedTenantId = tenantId;
        const branchResult = await withTenantContext({ tenantId: scopedTenantId }, tx =>
          tx.query.branches.findFirst({
            where: and(
              eq(branches.tenantId, scopedTenantId),
              or(eq(branches.id, branchId), eq(branches.code, branchId))
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

// Helper: Agent Metrics derivation
async function getAgentMetrics(branchId: string, tenantId: string) {
  // 1. Get agents in branch
  const [agents, cashPendingByAgent] = await Promise.all([
    withTenantContext({ tenantId }, tx =>
      tx.query.user.findMany({
        where: and(
          eq(user.branchId, branchId),
          eq(user.tenantId, tenantId),
          eq(user.role, 'agent')
        ),
        columns: { id: true, name: true },
      })
    ),
    getBranchCashPendingByAgent({ tenantId, branchId }),
  ]);

  if (agents.length === 0) return [];

  // 2. For each agent, compute metrics
  // This could be optimized with a complex single query grouping by agent_id,
  // but distinct counts for different tables (claims, payments) are tricky in one go without window functions.
  // Given the agent count per branch is reasonable (<50), Promise.all is acceptable.

  return Promise.all(
    agents.map(async agent => {
      const [openClaims, slaBreaches] = await Promise.all([
        // Open Claims linked to agent (via claim.agentId)
        withTenantContext({ tenantId }, tx =>
          tx
            .select({ count: count() })
            .from(claims)
            .where(
              and(
                eq(claims.agentId, agent.id),
                eq(claims.branchId, branchId),
                eq(claims.tenantId, tenantId),
                getOpenClaimsFilter()
              )
            )
        ),

        // SLA Breaches linked to agent
        withTenantContext({ tenantId }, tx =>
          tx
            .select({ count: count() })
            .from(claims)
            .where(
              and(
                eq(claims.agentId, agent.id),
                eq(claims.branchId, branchId),
                eq(claims.tenantId, tenantId),
                getSlaBreachesFilter()
              )
            )
        ),
      ]);

      return {
        id: agent.id,
        name: agent.name,
        openClaims: openClaims[0]?.count ?? 0,
        cashPending: cashPendingByAgent.get(agent.id) ?? 0,
        slaBreaches: slaBreaches[0]?.count ?? 0,
      };
    })
  );
}

// Helper: Staff Load derivation
// "inProgressClaims = claims in statuses ['verification','evaluation','negotiation','court','in_review'] assigned/handled by staff"
async function getStaffLoad(branchId: string, tenantId: string) {
  // 1. Get staff in tenant (staff are usually tenant-level, sometimes branch-scoped)
  const staffMembers = await withTenantContext({ tenantId }, tx =>
    tx.query.user.findMany({
      where: and(
        eq(user.tenantId, tenantId),
        eq(user.role, 'staff')
        // Optional: filter by branch if they have one set
        // or just show all staff who have worked on branch claims?
        // Prompt: "if staff has branchId, filter to branchId"
      ),
      columns: { id: true, name: true, branchId: true },
    })
  );

  const relevantStaff = staffMembers.filter(s => !s.branchId || s.branchId === branchId);

  if (relevantStaff.length === 0) return [];

  const IN_PROGRESS_STATUSES = [
    'submitted',
    'verification',
    'evaluation',
    'negotiation',
    'court',
  ] as const;

  return Promise.all(
    relevantStaff.map(async staff => {
      const workload = await withTenantContext({ tenantId }, tx =>
        tx
          .select({ count: count() })
          .from(claims)
          .where(
            and(
              eq(claims.staffId, staff.id),
              eq(claims.branchId, branchId), // Workload IN THIS BRANCH
              eq(claims.tenantId, tenantId),
              lifecycleSql.claimLifecycleStatusIn(IN_PROGRESS_STATUSES)
            )
          )
      );

      const countValue = workload[0]?.count ?? 0;

      let severity: 'healthy' | 'attention' | 'urgent' = 'healthy';
      if (countValue > 10) severity = 'urgent';
      else if (countValue > 5) severity = 'attention';

      return {
        id: staff.id,
        name: staff.name,
        workload: countValue,
        severity,
      };
    })
  );
}
