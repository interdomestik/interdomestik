import { claimInformationRequests, claims } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { isMemberUploadRole } from './member-upload-role';
import { deniesClaimDocumentContent } from '@/app/api/documents/branch-manager-document-boundary';
import { isAdmin } from '@/lib/roles.core';

type ClaimScopeRecord = {
  branchId?: string | null;
  staffId?: string | null;
};
type MemberClaimOwnershipRecord = {
  id: string;
};

export function canAccessClaimFromAdminUploadSurface(args: {
  branchId?: string | null;
  // The lifecycle is required so the staff check always sees it: a member draft is not staff work.
  claim: ClaimScopeRecord & { caseLifecycleState: string | null };
  role: string | null | undefined;
  userId: string;
}): boolean {
  const { claim, role, userId } = args;
  const branchId = args.branchId ?? null;

  if (!role || deniesClaimDocumentContent(role)) {
    return false;
  }

  if (isAdmin(role)) {
    return true;
  }

  // Fail closed: a missing lifecycle is denied like a member draft.
  if (
    role !== 'staff' ||
    claim.caseLifecycleState == null ||
    claim.caseLifecycleState === 'draft'
  ) {
    return false;
  }

  if (branchId !== null) {
    return claim.branchId === branchId || claim.staffId === userId;
  }

  return claim.staffId === userId || claim.staffId == null;
}

export async function findAccessibleAdminUploadClaim(args: {
  branchId?: string | null;
  claimId: string;
  role: string | null | undefined;
  authority: TenantAuthority;
  userId: string;
}): Promise<(ClaimScopeRecord & { caseLifecycleState: string | null }) | null> {
  if (deniesClaimDocumentContent(args.role)) return null;
  const { tenantId } = readTenantAuthority(args.authority);
  const claim = await withTenantAuthority(args.authority, tx =>
    tx.query.claims.findFirst({
      where: and(eq(claims.id, args.claimId), eq(claims.tenantId, tenantId)),
      columns: {
        branchId: true,
        caseLifecycleState: true,
        staffId: true,
      },
    })
  );

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

export async function findOwnedMemberUploadClaim(args: {
  claimId: string;
  authority: TenantAuthority;
  role: string | null | undefined;
  userId: string;
}): Promise<MemberClaimOwnershipRecord | null> {
  if (!isMemberUploadRole(args.role)) return null;
  const { tenantId } = readTenantAuthority(args.authority);
  // Member upload ownership is read under the member tenant context so RLS evaluates the same
  // exact id, home-tenant, and owner predicates that the member claim detail already satisfies.
  return withTenantAuthority(args.authority, async tx => {
    const claim = await tx.query.claims.findFirst({
      where: and(
        eq(claims.id, args.claimId),
        eq(claims.tenantId, tenantId),
        eq(claims.userId, args.userId)
      ),
      columns: {
        id: true,
      },
    });

    return claim ?? null;
  });
}

export async function findOwnedMemberInformationRequest(args: {
  claimId: string;
  informationRequestId: string;
  authority: TenantAuthority;
  userId: string;
}): Promise<{ id: string } | null> {
  const { tenantId } = readTenantAuthority(args.authority);
  return withTenantAuthority(args.authority, async tx => {
    const request = await tx
      .select({ id: claimInformationRequests.id })
      .from(claimInformationRequests)
      .innerJoin(
        claims,
        and(
          eq(claims.id, claimInformationRequests.claimId),
          eq(claims.tenantId, claimInformationRequests.tenantId)
        )
      )
      .where(
        and(
          eq(claimInformationRequests.id, args.informationRequestId),
          eq(claimInformationRequests.claimId, args.claimId),
          eq(claimInformationRequests.tenantId, tenantId),
          eq(claimInformationRequests.status, 'open'),
          eq(claims.userId, args.userId)
        )
      )
      .limit(1);

    return request[0] ?? null;
  });
}
