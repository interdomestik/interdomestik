import type * as DatabaseModule from '@interdomestik/database';
import { claims } from '@interdomestik/database/schema';
import type { CaseScopedAccessGrant } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import {
  hasCaseScopedDocumentGrant,
  hasScopedClaimReadAccess,
  isFullTenantClaimsRole,
  isScopedClaimReaderRole,
} from './access-policy';
import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';

type DatabaseClient = typeof DatabaseModule.db;
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
  ownerId: string | null;
  staffId: string | null;
  agentId: string | null;
};

export async function canReadPolymorphicClaimDocument(args: {
  db: DatabaseClient;
  polyDoc: {
    category?: unknown;
    entityId: string;
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
      claimStaffId: claims.staffId,
      claimAgentId: claims.agentId,
    })
    .from(claims)
    .where(and(eq(claims.id, polyDoc.entityId), eq(claims.tenantId, tenantId)));

  if (!claimRow) return false;
  if (await hasAnyCaseScopedGrant(db, tenantId, session, polyDoc.entityId, polyDoc.category)) {
    return true;
  }
  if (userRole !== 'agent' && claimRow.claimOwnerId === session.user.id) return true;
  if (!isScopedClaimReaderRole(userRole)) return false;

  return hasScopedClaimReadAccess({
    branchId: session.user.branchId ?? null,
    claim: {
      branchId: claimRow.claimBranchId ?? null,
      staffId: claimRow.claimStaffId ?? null,
      userId: claimRow.claimOwnerId ?? null,
      agentId: claimRow.claimAgentId ?? null,
    },
    role: userRole,
    userId: session.user.id,
  });
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
  if (
    document.claimId &&
    (await hasAnyCaseScopedGrant(db, tenantId, session, document.claimId, document.category))
  ) {
    return true;
  }
  if (
    userRole !== 'agent' &&
    (document.uploadedBy === session.user.id || claim.ownerId === session.user.id)
  ) {
    return true;
  }
  if (!isScopedClaimReaderRole(userRole)) return false;

  return hasScopedClaimReadAccess({
    branchId: session.user.branchId ?? null,
    claim: {
      branchId: claim.branchId,
      staffId: claim.staffId,
      userId: claim.ownerId,
      agentId: claim.agentId,
    },
    role: userRole,
    userId: session.user.id,
  });
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
