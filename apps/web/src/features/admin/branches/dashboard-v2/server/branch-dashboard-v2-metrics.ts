import { getBranchCashPendingByAgent } from '@/features/admin/branches/server/branch-cash-metrics';
import { getOpenClaimsFilter, getSlaBreachesFilter } from '@/features/admin/kpis/kpi-definitions';

import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { claims, user } from '@interdomestik/database/schema';
import * as lifecycleSql from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { and, count, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

// Helper: Agent Metrics derivation
export async function getAgentMetrics(branchId: string, authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  // 1. Get agents in branch
  const [agents, cashPendingByAgent] = await Promise.all([
    withTenantAuthority(authority, tx =>
      tx.query.user.findMany({
        where: and(
          eq(user.branchId, branchId),
          eq(user.tenantId, tenantId),
          eq(user.role, 'agent')
        ),
        columns: { id: true, name: true },
      })
    ),
    getBranchCashPendingByAgent({ authority, branchId }),
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
        withTenantAuthority(authority, tx =>
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
        withTenantAuthority(authority, tx =>
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
export async function getStaffLoad(branchId: string, authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  // 1. Get staff in tenant (staff are usually tenant-level, sometimes branch-scoped)
  const staffMembers = await withTenantAuthority(authority, tx =>
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
      const workload = await withTenantAuthority(authority, tx =>
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
