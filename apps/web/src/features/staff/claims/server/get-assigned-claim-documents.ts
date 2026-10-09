import {
  claimDocuments,
  claimInformationRequestEvidence,
  claims,
  withTenantContext,
} from '@interdomestik/database';
import { ensureAccessTenantId } from '@interdomestik/shared-auth';
import { and, desc, eq, isNull } from 'drizzle-orm';

export type AssignedStaffClaimDocument = {
  fileSize: number;
  fileType: string;
  id: string;
  name: string;
  url: string;
};

export type AssignedStaffDocumentSession = {
  user: {
    id: string;
    role?: string | null;
    tenantId?: string | null;
    accessTenantId?: string | null;
  };
};

/** Canonical authorized document route; storage paths and signed URLs never reach the page. */
export function buildAssignedStaffDocumentUrl(documentId: string): string {
  return `/api/documents/${encodeURIComponent(documentId)}/download`;
}

/**
 * Ordinary claim evidence for the currently assigned staff member only. The staff role and the
 * exact claim + tenant + staffId assignment are checked inside the tenant transaction before any
 * document metadata is read; every other viewer receives no documents and no links.
 */
export async function getAssignedStaffClaimDocuments(args: {
  claimId: string;
  session: AssignedStaffDocumentSession;
}): Promise<AssignedStaffClaimDocument[]> {
  const { claimId, session } = args;
  const staffId = session.user.id;
  if (session.user.role !== 'staff' || !staffId || !claimId) return [];
  let tenantId: string;
  try {
    tenantId = ensureAccessTenantId(session);
  } catch {
    return [];
  }

  return withTenantContext({ tenantId, role: 'staff' }, async tx => {
    // db-access-guard: tenant-scoped -- reason: exact claim, tenant, and assigned-staff predicates gate the document read below.
    const [assignment] = await tx
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(eq(claims.id, claimId), eq(claims.tenantId, tenantId), eq(claims.staffId, staffId))
      )
      .limit(1);
    if (!assignment) return [];

    // db-access-guard: tenant-scoped -- reason: documents are read only for the assigned claim in the same tenant.
    const rows = await tx
      .select({
        id: claimDocuments.id,
        name: claimDocuments.name,
        fileType: claimDocuments.fileType,
        fileSize: claimDocuments.fileSize,
      })
      .from(claimDocuments)
      .leftJoin(
        claimInformationRequestEvidence,
        and(
          eq(claimInformationRequestEvidence.tenantId, tenantId),
          eq(claimInformationRequestEvidence.claimId, assignment.id),
          eq(claimInformationRequestEvidence.documentId, claimDocuments.id)
        )
      )
      .where(
        and(
          eq(claimDocuments.claimId, assignment.id),
          eq(claimDocuments.tenantId, tenantId),
          isNull(claimInformationRequestEvidence.documentId)
        )
      )
      .orderBy(desc(claimDocuments.createdAt));

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      fileType: row.fileType,
      fileSize: row.fileSize,
      url: buildAssignedStaffDocumentUrl(row.id),
    }));
  });
}
