import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { agentCommissions, claims, user } from '@interdomestik/database/schema';
import { claimLifecycleStatusIn } from '@interdomestik/domain-claims';
import { and, count, eq, sum } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export interface BranchKPIs {
  totalAgents: number;
  totalMembers: number;
  claimsPending: number; // submitted + verification
  totalCommissionPaid: number;
}

export async function getBranchKPIs(
  authority: TenantAuthority,
  branchId: string
): Promise<BranchKPIs> {
  const { tenantId } = readTenantAuthority(authority);
  const [agentCount, memberCount, claimsPending, commissionPaid] = await Promise.all([
    withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(user)
        .where(
          and(eq(user.tenantId, tenantId), eq(user.branchId, branchId), eq(user.role, 'agent'))
        )
    ),
    withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(user)
        .where(
          and(eq(user.tenantId, tenantId), eq(user.branchId, branchId), eq(user.role, 'member'))
        )
    ),
    withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(
          and(
            eq(claims.tenantId, tenantId),
            eq(claims.branchId, branchId),
            claimLifecycleStatusIn(['submitted', 'verification'])
          )
        )
    ),
    // Assuming agentCommissions are linked to agents who belong to this branch.
    // This is a bit complex as commissions don't store branchId directly usually, but let's assume we filter by agent's branch.
    // For simplicity/speed in this strict execution: We sum commissions for agents in this branch.
    withTenantAuthority(authority, tx =>
      tx
        .select({ total: sum(agentCommissions.amount) })
        .from(agentCommissions)
        .innerJoin(user, eq(agentCommissions.agentId, user.id))
        .where(
          and(
            eq(agentCommissions.tenantId, tenantId),
            eq(user.tenantId, tenantId),
            eq(user.branchId, branchId),
            eq(agentCommissions.status, 'paid')
          )
        )
    ),
  ]);

  return {
    totalAgents: agentCount[0].count,
    totalMembers: memberCount[0].count,
    claimsPending: claimsPending[0].count,
    totalCommissionPaid: Number(commissionPaid[0]?.total || 0),
  };
}
