import { claims, db } from '@interdomestik/database';
import { and, eq } from 'drizzle-orm';

type ClaimScopeRecord = {
  branchId?: string | null;
  staffId?: string | null;
};

const FULL_TENANT_CLAIMS_ROLES = new Set(['admin', 'tenant_admin', 'super_admin']);

export function canAccessClaimFromAdminUploadSurface(args: {
  branchId?: string | null;
  claim: ClaimScopeRecord;
  role: string | null | undefined;
  userId: string;
}): boolean {
  const { claim, role, userId } = args;
  const branchId = args.branchId ?? null;

  if (!role) {
    return false;
  }

  if (FULL_TENANT_CLAIMS_ROLES.has(role)) {
    return true;
  }

  if (role === 'branch_manager') {
    return branchId !== null && claim.branchId === branchId;
  }

  if (role !== 'staff') {
    return false;
  }

  if (branchId !== null) {
    return claim.branchId === branchId;
  }

  return claim.staffId === userId || claim.staffId == null;
}

export async function findAccessibleAdminUploadClaim(args: {
  branchId?: string | null;
  claimId: string;
  role: string | null | undefined;
  tenantId: string;
  userId: string;
}): Promise<ClaimScopeRecord | null> {
  const claim = await db.query.claims.findFirst({
    where: and(eq(claims.id, args.claimId), eq(claims.tenantId, args.tenantId)),
    columns: {
      branchId: true,
      staffId: true,
    },
  });

  if (
    !claim ||
    !canAccessClaimFromAdminUploadSurface({
      branchId: args.branchId ?? null,
      claim,
      role: args.role,
      userId: args.userId,
    })
  ) {
    return null;
  }

  return claim;
}
