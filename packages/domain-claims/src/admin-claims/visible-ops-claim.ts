import { and, claims, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityPrincipal,
} from '@interdomestik/database/tenant-authority';
import { withAccessTenant, withTenant } from '@interdomestik/database/tenant-security';
import { isSuperAdmin, isTenantAdmin, ROLES } from '@interdomestik/shared-auth';
import { isNull, or, sql, type SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

type Viewer = Pick<TenantAuthorityPrincipal, 'role' | 'branchId'>;

export function canViewAdminClaims({ role, branchId }: Viewer): boolean {
  return isTenantAdmin(role) || isSuperAdmin(role) || (role === ROLES.branch_manager && !!branchId);
}

export function adminClaimsBranchCondition({ role, branchId }: Viewer): SQL | undefined {
  if (role !== ROLES.branch_manager) return undefined;
  return branchId ? eq(claims.branchId, branchId) : sql`false`;
}

export function selectVisibleOpsClaim({
  authority,
  claimId,
}: {
  authority: TenantAuthority;
  claimId: string;
}) {
  const { purpose, accessTenantId, tenantId, principal } = readTenantAuthority(authority);
  if (
    purpose !== 'session' ||
    tenantId !== accessTenantId ||
    !principal ||
    !canViewAdminClaims(principal)
  ) {
    return null;
  }

  return new QueryBuilder()
    .select()
    .from(claims)
    .where(
      and(
        or(
          withAccessTenant({ accessTenantId }, claims),
          withTenant(accessTenantId, claims.tenantId, isNull(claims.accessTenantId))
        ),
        eq(claims.id, claimId),
        adminClaimsBranchCondition(principal)
      )
    );
}
