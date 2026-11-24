import { and, claims, eq, type TenantTransaction } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityPrincipal,
} from '@interdomestik/database/tenant-authority';
import { withAccessTenant, withTenant } from '@interdomestik/database/tenant-security';
import { isSuperAdmin, isTenantAdmin, ROLES } from '@interdomestik/shared-auth';
import { isNull, or, sql, type SQL } from 'drizzle-orm';

type Viewer = Pick<TenantAuthorityPrincipal, 'role' | 'branchId'>;

export function canViewAdminClaims({ role, branchId }: Viewer): boolean {
  return isTenantAdmin(role) || isSuperAdmin(role) || (role === ROLES.branch_manager && !!branchId);
}

export function adminClaimsBranchCondition({ role, branchId }: Viewer): SQL | undefined {
  if (role !== ROLES.branch_manager) return undefined;
  return branchId ? eq(claims.branchId, branchId) : sql`false`;
}

export type VisibleOpsClaim = Readonly<{
  claim: Readonly<typeof claims.$inferSelect>;
  documentScope: () => { claimId: string; authority: TenantAuthority };
}>;

export async function getVisibleOpsClaim(
  tx: TenantTransaction,
  { authority, claimId }: { authority: TenantAuthority; claimId: string }
): Promise<VisibleOpsClaim | null> {
  const { purpose, accessTenantId, tenantId, principal } = readTenantAuthority(authority);
  if (
    purpose !== 'session' ||
    tenantId !== accessTenantId ||
    !principal ||
    !canViewAdminClaims(principal)
  ) {
    return null;
  }

  const claim = await tx.query.claims.findFirst({
    where: and(
      or(
        withAccessTenant({ accessTenantId }, claims),
        withTenant(accessTenantId, claims.tenantId, isNull(claims.accessTenantId))
      ),
      eq(claims.id, claimId),
      adminClaimsBranchCondition(principal)
    ),
  });
  if (!claim) return null;
  return Object.freeze({
    claim: Object.freeze(claim),
    documentScope() {
      return { claimId: claim.id, authority };
    },
  });
}
