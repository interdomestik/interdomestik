import { claimDocuments, claims, documents } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { matchesAccessTenant } from '@/lib/db/access-tenant-predicate';
import { canReadLegacyClaimDocument } from './claim-document-access';
import { lookupCrossGrantDoc } from './cross-tenant-document-lookup';
import { canReadPolymorphicDocument } from './polymorphic-document-access';
import {
  buildDocumentAudit,
  buildPolymorphicDocument,
  getPolymorphicDocumentAuditEntityType,
  getStorageFamilyForDocument,
  type DatabaseClient,
  type DocumentAccessResult,
  type DocumentReadArgs,
  type DocumentReadClient,
  type DocumentRow,
} from './document-access-model';

export async function readLocalDocumentAccess(
  args: DocumentReadArgs & { db: DocumentReadClient }
): Promise<DocumentAccessResult | null> {
  const { db, documentId, finalDisposition, mode, session, tenantId, userRole } = args;

  // 1. Try Polymorphic Documents Table
  const [polyDoc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)));

  if (polyDoc) {
    const canRead = await canReadPolymorphicDocument({
      db,
      polyDoc,
      session,
      tenantId,
      userRole,
    });

    if (!canRead) {
      return { ok: false, code: 'FORBIDDEN', message: 'Forbidden' };
    }

    const document = buildPolymorphicDocument(polyDoc);

    return {
      ok: true,
      document,
      storageFamily: getStorageFamilyForDocument(document),
      tenantId,
      audit: buildDocumentAudit({
        actorRole: userRole,
        disposition: finalDisposition,
        document,
        documentId,
        entityType: getPolymorphicDocumentAuditEntityType(polyDoc.entityType),
        mode,
      }),
    };
  }

  // 2. Legacy Claim Documents
  // db-access-guard: tenant-scoped -- reason: db is the caller-supplied tenant transaction; matchesAccessTenant limits the admitted document.
  const [row] = await db
    .select({
      doc: claimDocuments,
      claimOwnerId: claims.userId,
      claimBranchId: claims.branchId,
      claimStaffId: claims.staffId,
      claimAgentId: claims.agentId,
    })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(and(eq(claimDocuments.id, documentId), matchesAccessTenant(claimDocuments, tenantId)));

  if (!row?.doc) {
    // No same-tenant row: defer to the cross-tenant fallback once this transaction is released.
    return null;
  }

  const doc = row.doc as never as DocumentRow;
  const canRead = await canReadLegacyClaimDocument({
    claim: {
      branchId: row.claimBranchId ?? null,
      ownerId: row.claimOwnerId ?? null,
      staffId: row.claimStaffId ?? null,
      agentId: row.claimAgentId ?? null,
    },
    db,
    document: doc,
    tenantId,
    session,
    userRole,
  });

  if (!canRead) {
    return { ok: false, code: 'FORBIDDEN', message: 'Forbidden' };
  }

  return {
    ok: true,
    document: doc,
    storageFamily: getStorageFamilyForDocument(doc),
    tenantId: row.doc.tenantId ?? tenantId,
    audit: buildDocumentAudit({
      actorRole: userRole,
      disposition: finalDisposition,
      document: doc,
      documentId,
      mode,
    }),
  };
}

export async function readCrossGrantDocumentAccess(
  args: DocumentReadArgs & { db: DatabaseClient }
): Promise<DocumentAccessResult> {
  const { db, documentId, finalDisposition, mode, session, tenantId, userRole } = args;
  // Cross-tenant fallback for jurisdiction-handoff recovery/legal actors. Home tenant contexts
  // come only from the actor's durable grants; the helpers own their grant-scoped transactions.
  const crossDoc = await lookupCrossGrantDoc({
    actorId: session.user.id,
    accessTenantId: tenantId,
    db,
    documentId,
  });
  if (crossDoc === null) {
    return { ok: false, code: 'NOT_FOUND', message: 'Document not found' };
  }
  if (crossDoc.kind === 'poly') {
    const document = buildPolymorphicDocument(crossDoc.doc);
    return {
      ok: true,
      document,
      storageFamily: getStorageFamilyForDocument(document),
      tenantId: crossDoc.homeTenantId,
      audit: buildDocumentAudit({
        actorRole: userRole,
        disposition: finalDisposition,
        document,
        documentId,
        entityType: getPolymorphicDocumentAuditEntityType(crossDoc.doc.entityType),
        mode,
      }),
    };
  }
  const crossLegacy: DocumentRow = crossDoc.doc;
  return {
    ok: true,
    document: crossLegacy,
    storageFamily: getStorageFamilyForDocument(crossLegacy),
    tenantId: crossDoc.homeTenantId,
    audit: buildDocumentAudit({
      actorRole: userRole,
      disposition: finalDisposition,
      document: crossLegacy,
      documentId,
      mode,
    }),
  };
}
