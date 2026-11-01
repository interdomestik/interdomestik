import { withTenantContext } from '@interdomestik/database';
import { branches, claims, user } from '@interdomestik/database/schema';
import { claimLifecycleStatusIn, claimLifecycleStatusIs } from '@interdomestik/domain-claims';
import { and, count, eq } from 'drizzle-orm';

export interface TenantAdminKPIs {
  totalBranches: number;
  totalAgents: number;
  totalMembers: number;
  claimsByStatus: {
    draft: number;
    submitted: number;
    in_review: number;
    approved: number;
    rejected: number;
  };
}

export async function getTenantAdminKPIs(tenantId: string): Promise<TenantAdminKPIs> {
  const [
    branchCount,
    agentCount,
    memberCount,
    draftClaims,
    submittedClaims,
    reviewClaims,
    approvedClaims,
    rejectedClaims,
  ] = await Promise.all([
    withTenantContext({ tenantId }, tx =>
      tx.select({ count: count() }).from(branches).where(eq(branches.tenantId, tenantId))
    ),
    withTenantContext({ tenantId }, tx =>
      tx
        .select({ count: count() })
        .from(user)
        .where(and(eq(user.tenantId, tenantId), eq(user.role, 'agent')))
    ),
    withTenantContext({ tenantId }, tx =>
      tx
        .select({ count: count() })
        .from(user)
        .where(and(eq(user.tenantId, tenantId), eq(user.role, 'member')))
    ),
    withTenantContext({ tenantId }, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIs('draft')))
    ),
    withTenantContext({ tenantId }, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIs('submitted')))
    ),
    withTenantContext({ tenantId }, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(
          and(
            eq(claims.tenantId, tenantId),
            claimLifecycleStatusIn(['verification', 'evaluation', 'negotiation', 'court'])
          )
        )
    ),
    withTenantContext({ tenantId }, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIs('resolved')))
    ),
    withTenantContext({ tenantId }, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIs('rejected')))
    ),
  ]);

  return {
    totalBranches: branchCount[0].count,
    totalAgents: agentCount[0].count,
    totalMembers: memberCount[0].count,
    claimsByStatus: {
      draft: draftClaims[0].count,
      submitted: submittedClaims[0].count,
      in_review: reviewClaims[0].count,
      approved: approvedClaims[0].count,
      rejected: rejectedClaims[0].count,
    },
  };
}
