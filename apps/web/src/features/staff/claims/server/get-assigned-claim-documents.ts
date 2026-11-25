import { claimDocuments, claimInformationRequestEvidence, claims } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { clampPage, clampPerPage } from '../../../../lib/pagination';

const EVIDENCE_PAGE_SIZE = 20;
const REGISTER_PICKER_LIMIT = 100;

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
  };
};

/** Canonical authorized document route; storage paths and signed URLs never reach the page. */
export function buildAssignedStaffDocumentUrl(documentId: string): string {
  return `/api/documents/${encodeURIComponent(documentId)}/download`;
}

type DocumentRead = {
  claimId: string;
  session: AssignedStaffDocumentSession;
  authority: TenantAuthority | null;
};

export async function getAssignedStaffClaimDocuments(
  args: DocumentRead & { page?: number; perPage?: number }
) {
  const perPage = clampPerPage(args.perPage ?? EVIDENCE_PAGE_SIZE, EVIDENCE_PAGE_SIZE);
  const requestedPage = clampPage(args.page ?? 1);
  const page = Number.isSafeInteger((requestedPage - 1) * perPage) ? requestedPage : 1;
  const rows = await readAssignedStaffClaimDocuments(args, {
    offset: (page - 1) * perPage,
    limit: perPage + 1,
  });
  return { page, documents: rows.slice(0, perPage), hasNextPage: rows.length > perPage };
}

export function getRegisterPickerDocuments(args: DocumentRead) {
  return readAssignedStaffClaimDocuments(args, { limit: REGISTER_PICKER_LIMIT });
}

/**
 * Claim documents for the currently assigned staff member only. The staff role and the
 * exact claim + tenant + staffId assignment of a submitted (non-draft) claim are checked inside the tenant transaction before any
 * document metadata is read. The document statement rechecks that assignment at its own snapshot;
 * every other viewer receives no documents and no links.
 */
async function readAssignedStaffClaimDocuments(
  args: DocumentRead,
  bounds: { offset: number; limit: number } | { limit: number }
): Promise<AssignedStaffClaimDocument[]> {
  const { claimId, session, authority } = args;
  const staffId = session.user.id;
  if (session.user.role !== 'staff' || !staffId || !claimId || !authority) return [];
  const { tenantId } = readTenantAuthority(authority);

  return withTenantAuthority(authority, async tx => {
    // db-access-guard: tenant-scoped -- reason: exact claim, tenant, and assigned-staff predicates gate the document read below.
    const [assignment] = await tx
      .select({ id: claims.id })
      .from(claims)
      .where(
        and(
          eq(claims.id, claimId),
          eq(claims.tenantId, tenantId),
          eq(claims.staffId, staffId),
          ne(claims.caseLifecycleState, 'draft')
        )
      )
      .limit(1);
    if (!assignment) return [];

    // db-access-guard: tenant-scoped -- reason: the document statement itself rechecks exact claim, tenant, and current staff assignment.
    const paginateEvidence = 'offset' in bounds;
    const assignedDocuments = tx
      .select({
        id: claimDocuments.id,
        name: claimDocuments.name,
        fileType: claimDocuments.fileType,
        fileSize: claimDocuments.fileSize,
      })
      .from(claimDocuments)
      .innerJoin(
        claims,
        and(
          eq(claims.id, claimDocuments.claimId),
          eq(claims.tenantId, tenantId),
          eq(claims.staffId, staffId),
          ne(claims.caseLifecycleState, 'draft')
        )
      );
    const query = paginateEvidence
      ? assignedDocuments.leftJoin(
          claimInformationRequestEvidence,
          and(
            eq(claimInformationRequestEvidence.tenantId, tenantId),
            eq(claimInformationRequestEvidence.claimId, assignment.id),
            eq(claimInformationRequestEvidence.documentId, claimDocuments.id)
          )
        )
      : assignedDocuments;
    const bounded = query
      .where(
        and(
          eq(claimDocuments.claimId, assignment.id),
          eq(claimDocuments.tenantId, tenantId),
          paginateEvidence
            ? isNull(claimInformationRequestEvidence.documentId)
            : sql`public.claim_document_provenance_ok(${claimDocuments.tenantId}, ${claimDocuments.claimId}, ${claimDocuments.id})`
        )
      )
      .orderBy(sql`${claimDocuments.createdAt} desc nulls last`, claimDocuments.id)
      .limit(bounds.limit);
    const rows = await (paginateEvidence ? bounded.offset(bounds.offset) : bounded);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      fileType: row.fileType,
      fileSize: row.fileSize,
      url: buildAssignedStaffDocumentUrl(row.id),
    }));
  });
}
