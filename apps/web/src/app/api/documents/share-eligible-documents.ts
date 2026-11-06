import type * as DatabaseModule from '@interdomestik/database';
import { claims, documents, policies } from '@interdomestik/database/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  hasScopedClaimReadAccess,
  isFullTenantClaimsRole,
  isScopedClaimReaderRole,
} from './access-policy';
import { hasAgentClaimDocumentScope } from './agent-document-scope';

type TenantTransaction = DatabaseModule.TenantTransaction;

export type ShareActor = { id: string; branchId?: string | null; role: string | null | undefined };

type ShareDocumentRow = {
  id: string;
  entityId: string;
  entityType: string;
  uploadedBy: string | null;
};

/**
 * Creating a share pack mints an outward bearer capability, so it is a delegation, not a read.
 * Read-oriented roles (auditor, global_support) never delegate, whatever they may read.
 */
const NON_SHARING_ROLES: ReadonlySet<string> = new Set(['auditor', 'global_support']);

/**
 * True only when the actor may share every requested document: each must be an active document
 * of this tenant that the actor reads through its own role scope. This is the polymorphic
 * document read policy (polymorphic-document-access.ts) without the delegated case-grant
 * fallback: a grant to read a case never confers the right to pass its documents on.
 */
export async function canShareAllDocuments(args: {
  actor: ShareActor;
  documentIds: readonly string[];
  tenantId: string;
  tx: TenantTransaction;
}): Promise<boolean> {
  const { actor, documentIds, tenantId, tx } = args;
  if (documentIds.length === 0 || !actor.role || NON_SHARING_ROLES.has(actor.role)) return false;

  const rows = await tx
    .select({
      id: documents.id,
      entityId: documents.entityId,
      entityType: documents.entityType,
      uploadedBy: documents.uploadedBy,
    })
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, tenantId),
        inArray(documents.id, [...documentIds]),
        isNull(documents.deletedAt)
      )
    );
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const id of documentIds) {
    const row = byId.get(id);
    if (!row || !(await canShareDocument({ actor, row, tenantId, tx }))) return false;
  }
  return true;
}

async function canShareDocument(args: {
  actor: ShareActor;
  row: ShareDocumentRow;
  tenantId: string;
  tx: TenantTransaction;
}): Promise<boolean> {
  const { actor, row, tenantId, tx } = args;
  const role = actor.role ?? undefined;
  if (isFullTenantClaimsRole(role)) return true;
  if (
    row.uploadedBy === actor.id &&
    !(role === 'agent' && row.entityType === 'claim') &&
    row.entityType !== 'policy'
  ) {
    return true;
  }
  if (row.entityType === 'member' || row.entityType === 'user') return row.entityId === actor.id;
  if (row.entityType === 'claim')
    return canShareClaimDocument({ actor, claimId: row.entityId, tenantId, tx });
  if (row.entityType !== 'policy') return false;

  const [policy] = await tx
    .select({ ownerId: policies.userId })
    .from(policies)
    .where(and(eq(policies.id, row.entityId), eq(policies.tenantId, tenantId)));
  return policy?.ownerId === actor.id;
}

async function canShareClaimDocument(args: {
  actor: ShareActor;
  claimId: string;
  tenantId: string;
  tx: TenantTransaction;
}): Promise<boolean> {
  const { actor, claimId, tenantId, tx } = args;
  const role = actor.role ?? undefined;
  const [claim] = await tx
    .select({
      agentId: claims.agentId,
      branchId: claims.branchId,
      caseLifecycleState: claims.caseLifecycleState,
      ownerId: claims.userId,
      staffId: claims.staffId,
    })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)));
  if (!claim) return false;
  if (role !== 'agent' && claim.ownerId === actor.id) return true;
  if (role === 'agent') {
    return hasAgentClaimDocumentScope({ agentId: actor.id, claim, db: tx, tenantId });
  }
  // A member's draft is not staff work: staff cannot share its documents before submission.
  const lifecycle = claim.caseLifecycleState;
  if (role === 'staff' && (lifecycle == null || lifecycle === 'draft')) return false;
  return (
    isScopedClaimReaderRole(role) &&
    hasScopedClaimReadAccess({
      branchId: actor.branchId ?? null,
      claim: { branchId: claim.branchId, staffId: claim.staffId, userId: claim.ownerId },
      role,
      userId: actor.id,
    })
  );
}
