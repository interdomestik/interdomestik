import { and, claims, eq, type TenantTransaction } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
  type TenantAuthorityPrincipal,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withAccessTenant, withTenant } from '@interdomestik/database/tenant-security';
import { isSuperAdmin, isTenantAdmin, ROLES } from '@interdomestik/shared-auth';
import { exists, isNull, or, sql, type SQL } from 'drizzle-orm';

type Viewer = Pick<TenantAuthorityPrincipal, 'role' | 'branchId'>;

export function canViewAdminClaims({ role, branchId }: Viewer): boolean {
  return isTenantAdmin(role) || isSuperAdmin(role) || (role === ROLES.branch_manager && !!branchId);
}

export function adminClaimsBranchCondition({ role, branchId }: Viewer): SQL | undefined {
  if (role !== ROLES.branch_manager) return undefined;
  return branchId ? eq(claims.branchId, branchId) : sql`false`;
}

const proofBrand: unique symbol = Symbol();

export type VisibleOpsClaim = Readonly<{
  [proofBrand]: true;
  claim: Readonly<typeof claims.$inferSelect>;
}>;

const liveProofs = new WeakMap<
  VisibleOpsClaim,
  { tx: TenantTransaction; authority: TenantAuthority; claimId: string }
>();

function visibleClaimWhere(claimId: string, accessTenantId: string, principal: Viewer) {
  return and(
    or(
      withAccessTenant({ accessTenantId }, claims),
      withTenant(accessTenantId, claims.tenantId, isNull(claims.accessTenantId))
    ),
    eq(claims.id, claimId),
    adminClaimsBranchCondition(principal)
  );
}

export function readVisibleOpsClaimDocumentScope(
  tx: TenantTransaction,
  visibleClaim: VisibleOpsClaim
) {
  const proof = liveProofs.get(visibleClaim);
  if (!proof || proof.tx !== tx) throw new Error('Invalid visible claim proof');
  const { accessTenantId, principal } = readTenantAuthority(proof.authority);
  if (!principal) throw new Error('Invalid visible claim proof');

  return {
    claimId: proof.claimId,
    accessTenantId,
    countOnly: principal.role === ROLES.branch_manager,
    claimStillVisible: exists(
      tx
        .select({ id: claims.id })
        .from(claims)
        .where(visibleClaimWhere(proof.claimId, accessTenantId, principal))
    ),
  };
}

export async function getVisibleOpsClaim<T>(
  { authority, claimId }: { authority: TenantAuthority; claimId: string },
  read: (tx: TenantTransaction, visibleClaim: VisibleOpsClaim) => Promise<T>
): Promise<T | null> {
  const { purpose, accessTenantId, tenantId, principal } = readTenantAuthority(authority);
  if (
    purpose !== 'session' ||
    tenantId !== accessTenantId ||
    !principal ||
    !canViewAdminClaims(principal)
  ) {
    return null;
  }

  return withTenantAuthority(authority, async tx => {
    const claim = await tx.query.claims.findFirst({
      where: visibleClaimWhere(claimId, accessTenantId, principal),
    });
    if (!claim) return null;

    const visibleClaim: VisibleOpsClaim = Object.freeze({
      [proofBrand]: true,
      claim: Object.freeze(claim),
    });
    liveProofs.set(visibleClaim, { tx, authority, claimId: claim.id });
    try {
      return await read(tx, visibleClaim);
    } finally {
      liveProofs.delete(visibleClaim);
    }
  });
}
