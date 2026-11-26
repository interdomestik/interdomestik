import {
  and,
  auditLog,
  claimInformationRequestEvidence,
  claimInformationRequests,
  claims,
  eq,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { isSuperAdmin, isTenantAdmin } from '@interdomestik/shared-auth';
import { randomUUID } from 'node:crypto';

type Surface = 'admin' | 'member';

type EvidenceClaim = {
  branchId?: string | null;
  caseLifecycleState: string | null;
  staffId?: string | null;
};

export type LockedClaimEvidenceScope = Readonly<{
  tenantId: string;
  claimId: string;
  actorId: string;
  informationRequestId: string | null;
}>;

export function isMemberUploadRole(role: string | null | undefined): boolean {
  return role === 'member' || role === 'user' || role === 'agent';
}

export function canAccessClaimFromAdminUploadSurface({
  branchId = null,
  claim,
  role,
  userId,
}: {
  branchId?: string | null;
  claim: EvidenceClaim;
  role: string | null | undefined;
  userId: string;
}): boolean {
  if (isTenantAdmin(role) || isSuperAdmin(role)) return true;
  if (
    role !== 'staff' ||
    claim.caseLifecycleState == null ||
    claim.caseLifecycleState === 'draft'
  ) {
    return false;
  }
  if (claim.staffId === userId) return true;
  return branchId === null ? claim.staffId == null : claim.branchId === branchId;
}

export async function lockClaimForEvidence(
  tx: TenantTransaction,
  {
    authority,
    claimId,
    surface,
    informationRequestId = null,
  }: {
    authority: TenantAuthority;
    claimId: string;
    surface: Surface;
    informationRequestId?: string | null;
  }
): Promise<LockedClaimEvidenceScope | null> {
  const { tenantId, accessTenantId, principal, purpose } = readTenantAuthority(authority);
  if (
    !principal ||
    (purpose !== 'session' && purpose !== 'test') ||
    tenantId !== accessTenantId ||
    (surface === 'member' && !isMemberUploadRole(principal.role)) ||
    (surface === 'admin' && informationRequestId !== null)
  ) {
    return null;
  }

  const [claim] = await tx
    .select({
      tenantId: claims.tenantId,
      accessTenantId: claims.accessTenantId,
      userId: claims.userId,
      branchId: claims.branchId,
      staffId: claims.staffId,
      caseLifecycleState: claims.caseLifecycleState,
    })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .for('update');

  if (!claim || (claim.accessTenantId ?? claim.tenantId) !== accessTenantId) return null;
  const actorId = principal.userId;
  const visible =
    surface === 'member'
      ? claim.userId === actorId
      : canAccessClaimFromAdminUploadSurface({
          branchId: principal.branchId,
          claim,
          role: principal.role,
          userId: actorId,
        });
  if (!visible) return null;

  if (informationRequestId !== null) {
    const [request] = await tx
      .select({ id: claimInformationRequests.id })
      .from(claimInformationRequests)
      .where(
        and(
          eq(claimInformationRequests.id, informationRequestId),
          eq(claimInformationRequests.tenantId, tenantId),
          eq(claimInformationRequests.claimId, claimId),
          eq(claimInformationRequests.status, 'open')
        )
      )
      .for('update');
    if (!request) return null;
  }

  return { tenantId, claimId, actorId, informationRequestId };
}

export async function matchesInformationRequestEvidence(
  tx: TenantTransaction,
  scope: LockedClaimEvidenceScope,
  documentId: string
): Promise<boolean> {
  const [link] = await tx
    .select({
      requestId: claimInformationRequestEvidence.requestId,
      submittedByMemberId: claimInformationRequestEvidence.submittedByMemberId,
    })
    .from(claimInformationRequestEvidence)
    .where(
      and(
        eq(claimInformationRequestEvidence.tenantId, scope.tenantId),
        eq(claimInformationRequestEvidence.claimId, scope.claimId),
        eq(claimInformationRequestEvidence.documentId, documentId)
      )
    )
    .limit(1);

  return scope.informationRequestId === null
    ? !link
    : link?.requestId === scope.informationRequestId && link.submittedByMemberId === scope.actorId;
}

export async function linkInformationRequestEvidence(
  tx: TenantTransaction,
  { tenantId, claimId, actorId, informationRequestId }: LockedClaimEvidenceScope,
  documentId: string
): Promise<void> {
  if (informationRequestId === null) return;

  // db-access-guard: tenant-scoped -- reason: the link copies scope from the locked claim and open request.
  await tx.insert(claimInformationRequestEvidence).values({
    tenantId,
    claimId,
    requestId: informationRequestId,
    documentId,
    submittedByMemberId: actorId,
  });
  // db-access-guard: tenant-scoped -- reason: the audit records the locked request and verified member actor.
  await tx.insert(auditLog).values({
    id: randomUUID(),
    tenantId,
    actorId,
    actorRole: 'member',
    action: 'claim_information_request.evidence_submitted',
    entityType: 'claim_information_request',
    entityId: informationRequestId,
    metadata: { documentId },
  });
}
