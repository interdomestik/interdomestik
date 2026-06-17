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
  staffId?: string | null;
  userId: string | null;
  agentId?: string | null;
};

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
  if (args.role === 'agent') return args.claim.agentId === args.userId;

  if (args.role === 'branch_manager') {
    const branchId = args.branchId ?? null;
    return branchId !== null && args.claim.branchId === branchId;
  }

  return args.role === 'staff' && args.claim.staffId === args.userId;
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
