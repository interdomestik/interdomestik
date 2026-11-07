import type * as DatabaseModule from '@interdomestik/database';
import { claims } from '@interdomestik/database/schema';
import type { CaseScopedAccessGrant } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import {
  hasCaseScopedDocumentGrant,
  hasScopedClaimReadAccess,
  isFullTenantClaimsRole,
  isScopedClaimReaderRole,
  isStaffBlockedFromClaim,
} from './access-policy';
import { hasAgentClaimDocumentScope } from './agent-document-scope';
import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';

// Normal-tenant reads pass the tenant-bound transaction opened by getDocumentAccessCore.
type DatabaseClient = typeof DatabaseModule.db | DatabaseModule.TenantTransaction;
type GrantDocumentClass = Parameters<typeof hasCaseScopedDocumentGrant>[0]['documentClass'];
const FALLBACK_DOCUMENT_CLASS: GrantDocumentClass = 'other';

type SessionDTO = {
  user: {
    id: string;
    branchId?: string | null;
    caseScopedAccessGrants?: readonly CaseScopedAccessGrant[] | null;
  };
};

type ClaimDocument = {
  category?: unknown;
  claimId: string | null;
  uploadedBy: string | null;
};

type ClaimAccessRow = {
  branchId: string | null;
  caseLifecycleState: string | null;
  ownerId: string | null;
  staffId: string | null;
  agentId: string | null;
};

export async function canReadPolymorphicClaimDocument(args: {
  db: DatabaseClient;
  polyDoc: {
    category?: unknown;
    entityId: string;
    uploadedBy?: string | null;
  };
  session: SessionDTO;
  tenantId: string;
  userRole: string | undefined;
}): Promise<boolean> {
  const { db, polyDoc, session, tenantId, userRole } = args;
  const [claimRow] = await db
    .select({
      claimOwnerId: claims.userId,
      claimBranchId: claims.branchId,
      claimCaseLifecycleState: claims.caseLifecycleState,
      claimStaffId: claims.staffId,
      claimAgentId: claims.agentId,
    })
    .from(claims)
    .where(and(eq(claims.id, polyDoc.entityId), eq(claims.tenantId, tenantId)));

  if (!claimRow) return false;
  if (userRole !== 'agent' && claimRow.claimOwnerId === session.user.id) return true;
  if (isStaffBlockedFromClaim(userRole, claimRow.claimCaseLifecycleState)) return false;
  if (userRole === 'staff' && polyDoc.uploadedBy === session.user.id) return true;
  const claim = {
    branchId: claimRow.claimBranchId ?? null,
    caseLifecycleState: claimRow.claimCaseLifecycleState ?? null,
    ownerId: claimRow.claimOwnerId ?? null,
    staffId: claimRow.claimStaffId ?? null,
    agentId: claimRow.claimAgentId ?? null,
  };
  if (await hasScopedClaimDocumentAccess({ claim, db, session, tenantId, userRole })) return true;

  return hasAnyCaseScopedGrant(db, tenantId, session, polyDoc.entityId, polyDoc.category);
}

export async function canReadLegacyClaimDocument(args: {
  claim: ClaimAccessRow;
  db: DatabaseClient;
  document: ClaimDocument;
  session: SessionDTO;
  tenantId: string;
  userRole: string | undefined;
}): Promise<boolean> {
  const { claim, db, document, session, tenantId, userRole } = args;

  if (isFullTenantClaimsRole(userRole)) return true;
  if (userRole !== 'agent' && claim.ownerId === session.user.id) return true;
  // Staff have no rights on someone else's draft, not even as its uploader or through a grant.
  if (isStaffBlockedFromClaim(userRole, claim.caseLifecycleState)) return false;
  if (userRole !== 'agent' && document.uploadedBy === session.user.id) return true;

  if (await hasScopedClaimDocumentAccess({ claim, db, session, tenantId, userRole })) return true;

  if (!document.claimId) return false;
  return hasAnyCaseScopedGrant(db, tenantId, session, document.claimId, document.category);
}

/** Role-scoped claim reads: agents by active client link and branch, staff and managers by policy. */
async function hasScopedClaimDocumentAccess(args: {
  claim: ClaimAccessRow;
  db: DatabaseClient;
  session: SessionDTO;
  tenantId: string;
  userRole: string | undefined;
}): Promise<boolean> {
  const { claim, db, session, tenantId, userRole } = args;
  if (userRole === 'agent') {
    return hasAgentClaimDocumentScope({ agentId: session.user.id, claim, db, tenantId });
  }
  return (
    isScopedClaimReaderRole(userRole) &&
    hasScopedClaimReadAccess({
      branchId: session.user.branchId ?? null,
      claim: {
        branchId: claim.branchId,
        caseLifecycleState: claim.caseLifecycleState,
        staffId: claim.staffId,
        userId: claim.ownerId,
      },
      role: userRole,
      userId: session.user.id,
    })
  );
}

async function hasAnyCaseScopedGrant(
  db: DatabaseClient,
  accessTenantId: string,
  session: SessionDTO,
  caseId: string,
  documentClass: unknown
): Promise<boolean> {
  if (
    hasCaseScopedDocumentGrant({
      accessTenantId,
      caseId,
      documentClass: toSessionDocumentClass(documentClass),
      session,
    })
  ) {
    return true;
  }

  return hasDurableCaseScopedDocumentGrant({
    accessTenantId,
    actorId: session.user.id,
    caseId,
    db,
    documentClass,
  });
}

function toSessionDocumentClass(value: unknown): GrantDocumentClass {
  return typeof value === 'string' ? (value as GrantDocumentClass) : FALLBACK_DOCUMENT_CLASS;
}
