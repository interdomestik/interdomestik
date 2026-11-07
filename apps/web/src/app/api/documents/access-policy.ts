import {
  canUseCaseScopedDocumentGrant,
  type CaseScopedAccessGrant,
  type CaseScopedDocumentClass,
} from '@interdomestik/shared-auth';

export type DocumentAccessSession = {
  user: {
    id: string;
    branchId?: string | null;
    caseScopedAccessGrants?: readonly CaseScopedAccessGrant[] | null;
  };
};

export type ScopedClaim = {
  branchId?: string | null;
  caseLifecycleState: string | null;
  staffId?: string | null;
  userId: string | null;
};

/**
 * Staff have no rights on a member draft: a claim reaches staff only after submission. A missing
 * lifecycle fails closed. Callers check claim ownership first.
 */
export function isStaffBlockedFromClaim(
  role: string | null | undefined,
  caseLifecycleState: string | null | undefined
): boolean {
  return role === 'staff' && (caseLifecycleState == null || caseLifecycleState === 'draft');
}

export function isFullTenantClaimsRole(role: string | null | undefined): boolean {
  return (
    role === 'admin' ||
    role === 'tenant_admin' ||
    role === 'super_admin' ||
    role === 'global_support'
  );
}

export function isScopedClaimReaderRole(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'branch_manager' || role === 'agent';
}

export function hasScopedClaimReadAccess(args: {
  branchId?: string | null;
  claim: ScopedClaim;
  role: string | null | undefined;
  userId: string;
}): boolean {
  // Agents are scoped by their active client links; see agent-document-scope.ts.
  if (args.role === 'branch_manager') {
    const branchId = args.branchId ?? null;
    return branchId !== null && args.claim.branchId === branchId;
  }

  return (
    args.role === 'staff' &&
    args.claim.staffId === args.userId &&
    !isStaffBlockedFromClaim(args.role, args.claim.caseLifecycleState)
  );
}

export function hasCaseScopedDocumentGrant(args: {
  accessTenantId: string;
  caseId: string;
  documentClass: CaseScopedDocumentClass;
  session: DocumentAccessSession;
}): boolean {
  return canUseCaseScopedDocumentGrant({
    accessTenantId: args.accessTenantId,
    actorId: args.session.user.id,
    caseId: args.caseId,
    documentClass: args.documentClass,
    grants: args.session.user.caseScopedAccessGrants,
  });
}
