import { db } from '@interdomestik/database';
import { branches, claims, user } from '@interdomestik/database/schema';
import { and, count, eq, inArray } from 'drizzle-orm';

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
    db.select({ count: count() }).from(branches).where(eq(branches.tenantId, tenantId)),
    db
      .select({ count: count() })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.role, 'agent'))),
    db
      .select({ count: count() })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.role, 'member'))),
    db
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), eq(claims.status, 'draft'))),
    db
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), eq(claims.status, 'submitted'))),
    db
      .select({ count: count() })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, tenantId),
          inArray(claims.status, ['verification', 'evaluation', 'negotiation', 'court'])
        )
      ),
    db
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), eq(claims.status, 'resolved'))),
    db
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.tenantId, tenantId), eq(claims.status, 'rejected'))),
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
