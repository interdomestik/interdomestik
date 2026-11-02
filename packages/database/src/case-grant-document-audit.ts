import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, ne, or } from 'drizzle-orm';
import { dbAdmin } from './db';
import { caseScopedAccessGrants } from './schema/case-scoped-access-grants';
import { claimDocuments } from './schema/claim-support-tables';
import { documents } from './schema/documents';
import { auditLog } from './schema/notes';
import { readTenantAuthority, type TenantAuthority } from './tenant-authority';

// A document read through a durable case-scoped grant belongs to the case's home tenant, which
// records who read it. The reader holds only its own tenant's authority, so this fixed append writes
// that one audit row into the home tenant after confirming, from the home tenant's own rows, that
// the document belongs to a case the reader holds an active grant for. It grants no read and no
// other write, and the reader never holds an authority for the home tenant.

const CASE_GRANT_DOCUMENT_ACTIONS = new Set([
  'document.view',
  'document.download',
  'document.signed_url_issued',
]);
const CASE_GRANT_DOCUMENT_ENTITY_TYPES = new Set(['claim_document', 'policy_document']);
const MAX_METADATA_BYTES = 2_048;

/** The document table the authorized read selected: the append looks only there. */
export type CaseGrantDocumentSource = 'claim_documents' | 'documents';

export type CaseGrantDocumentAuditEvent = Readonly<{
  homeTenantId: string;
  documentId: string;
  source: CaseGrantDocumentSource;
  action: string;
  entityType: string;
  metadata?: Record<string, unknown>;
}>;

// Document ids are unique per table, not across tables: the case is read only from the table the
// authorized read selected, so a same-id row in the other table can neither drop nor redirect it.
async function caseOfHomeDocument(
  source: CaseGrantDocumentSource,
  homeTenantId: string,
  documentId: string
): Promise<string | null> {
  if (source === 'claim_documents') {
    // db-access-guard: system-exempt -- reason: the case of one home-tenant document, to confirm the reader's grant before an audit append
    const [legacy] = await dbAdmin
      .select({ caseId: claimDocuments.claimId })
      .from(claimDocuments)
      .where(and(eq(claimDocuments.id, documentId), eq(claimDocuments.tenantId, homeTenantId)))
      .limit(1);
    return legacy?.caseId ?? null;
  }
  if (source !== 'documents') return null;
  // db-access-guard: system-exempt -- reason: the case of one home-tenant document, to confirm the reader's grant before an audit append
  const [polymorphic] = await dbAdmin
    .select({ caseId: documents.entityId })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.tenantId, homeTenantId),
        eq(documents.entityType, 'claim')
      )
    )
    .limit(1);
  return polymorphic?.caseId ?? null;
}

/**
 * Appends the home-tenant audit row of one case-grant document read by the holder of `reader`.
 * Returns false (writing nothing) unless the document is a case document of `homeTenantId`, another
 * tenant than the reader's, and the reader's principal holds an active grant for that case.
 */
export async function appendCaseGrantDocumentAudit(
  reader: TenantAuthority,
  event: CaseGrantDocumentAuditEvent
): Promise<boolean> {
  const descriptor = readTenantAuthority(reader);
  const actorId = descriptor.principal?.userId;
  const homeTenantId = typeof event.homeTenantId === 'string' ? event.homeTenantId.trim() : '';
  const documentId = typeof event.documentId === 'string' ? event.documentId.trim() : '';
  if (!actorId || !homeTenantId || !documentId || homeTenantId === descriptor.tenantId)
    return false;
  if (
    !CASE_GRANT_DOCUMENT_ACTIONS.has(event.action) ||
    !CASE_GRANT_DOCUMENT_ENTITY_TYPES.has(event.entityType)
  ) {
    return false;
  }
  const metadata = {
    ...event.metadata,
    accessTenantId: descriptor.tenantId,
    viaCaseScopedGrant: true,
  };
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > MAX_METADATA_BYTES) return false;

  const caseId = await caseOfHomeDocument(event.source, homeTenantId, documentId);
  if (!caseId) return false;
  // db-access-guard: system-exempt -- reason: confirms the reader's own active grant for this home case before an audit append
  const [grant] = await dbAdmin
    .select({ id: caseScopedAccessGrants.id })
    .from(caseScopedAccessGrants)
    .where(
      and(
        eq(caseScopedAccessGrants.tenantId, homeTenantId),
        eq(caseScopedAccessGrants.accessTenantId, descriptor.tenantId),
        ne(caseScopedAccessGrants.tenantId, descriptor.tenantId),
        eq(caseScopedAccessGrants.caseId, caseId),
        eq(caseScopedAccessGrants.actorId, actorId),
        isNull(caseScopedAccessGrants.revokedAt),
        or(
          isNull(caseScopedAccessGrants.expiresAt),
          gt(caseScopedAccessGrants.expiresAt, new Date())
        )
      )
    )
    .limit(1);
  if (!grant) return false;

  // db-access-guard: system-exempt -- reason: fixed home-tenant audit row of a grant-confirmed case document read; no read returned
  await dbAdmin.insert(auditLog).values({
    id: randomUUID(),
    tenantId: homeTenantId,
    actorId,
    actorRole: descriptor.principal?.role ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: documentId,
    metadata,
  });
  return true;
}
