import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { branches, claims, user } from '@interdomestik/database/schema';
import { claimLifecycleStatusIn, claimLifecycleStatusIs } from '@interdomestik/domain-claims';
import { and, count, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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

export async function getTenantAdminKPIs(authority: TenantAuthority): Promise<TenantAdminKPIs> {
  const { tenantId } = readTenantAuthority(authority);
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
    withTenantAuthority(authority, tx =>
      tx.select({ count: count() }).from(branches).where(eq(branches.tenantId, tenantId))
    ),
    withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(user)
        .where(and(eq(user.tenantId, tenantId), eq(user.role, 'agent')))
    ),
    withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(user)
        .where(and(eq(user.tenantId, tenantId), eq(user.role, 'member')))
    ),
    withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIs('draft')))
    ),
    withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIs('submitted')))
    ),
    withTenantAuthority(authority, tx =>
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
    withTenantAuthority(authority, tx =>
      tx
        .select({ count: count() })
        .from(claims)
        .where(and(eq(claims.tenantId, tenantId), claimLifecycleStatusIs('resolved')))
    ),
    withTenantAuthority(authority, tx =>
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
