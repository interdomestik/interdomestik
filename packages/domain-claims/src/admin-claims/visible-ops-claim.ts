import type { TenantTransaction } from '@interdomestik/database';
import { claims } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityPrincipal,
} from '@interdomestik/database/tenant-authority';
import { withAccessTenant, withTenant } from '@interdomestik/database/tenant-security';
import { isSuperAdmin, isTenantAdmin, ROLES } from '@interdomestik/shared-auth';
import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm';

type Viewer = Pick<TenantAuthorityPrincipal, 'role' | 'branchId'>;

export function canViewAdminClaims({ role, branchId }: Viewer): boolean {
  return isTenantAdmin(role) || isSuperAdmin(role) || (role === ROLES.branch_manager && !!branchId);
}

function opsClaimDetailBranchCondition({ role, branchId }: Viewer): SQL | undefined {
  if (role !== ROLES.branch_manager) return undefined;
  return branchId ? eq(claims.branchId, branchId) : sql`false`;
}

export function readOpsClaimAuthority(authority: TenantAuthority) {
  const { purpose, accessTenantId, tenantId, principal } = readTenantAuthority(authority);
  if (
    purpose !== 'session' ||
    tenantId !== accessTenantId ||
    !principal ||
    !canViewAdminClaims(principal)
  ) {
    return null;
  }
  return { accessTenantId, principal };
}

export function selectVisibleOpsClaim(
  tx: TenantTransaction,
  { authority, claimId }: { authority: TenantAuthority; claimId: string }
) {
  const scope = readOpsClaimAuthority(authority);
  if (!scope) return null;
  const { accessTenantId, principal } = scope;

  return tx
    .select()
    .from(claims)
    .where(
      and(
        or(
          withAccessTenant({ accessTenantId }, claims),
          withTenant(accessTenantId, claims.tenantId, isNull(claims.accessTenantId))
        ),
        eq(claims.id, claimId),
        opsClaimDetailBranchCondition(principal)
      )
    )
    .as('visible_ops_claim');
}
