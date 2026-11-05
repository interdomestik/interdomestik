import { claimDocuments, claims, documents } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import type { DocumentAccessDeps } from './_core';
import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';

type DatabaseClient = DocumentAccessDeps['db'];
type SessionDTO = { user: { id: string } };
type PolymorphicClaimDocument = typeof documents.$inferSelect;
type LegacyClaimDocument = typeof claimDocuments.$inferSelect;

export type GrantedLegacyClaimDocument = {
  doc: LegacyClaimDocument;
  claimAgentId: string | null;
  claimBranchId: string | null;
  claimOwnerId: string | null;
  claimStaffId: string | null;
};

export async function findDurableGrantedPolymorphicClaimDocument(args: {
  accessTenantId: string;
  db: DatabaseClient;
  documentId: string;
  session: SessionDTO;
}): Promise<PolymorphicClaimDocument | null> {
  const [polyDoc] = await args.db
    .select()
    .from(documents)
    .where(and(eq(documents.id, args.documentId), eq(documents.entityType, 'claim')));
  if (polyDoc?.entityType !== 'claim') return null;

  const allowed = await hasDurableCaseScopedDocumentGrant({
    accessTenantId: args.accessTenantId,
    actorId: args.session.user.id,
    caseId: polyDoc.entityId,
    db: args.db,
    documentClass: polyDoc.category,
    homeTenantId: polyDoc.tenantId,
  });
  return allowed ? polyDoc : null;
}

export async function findDurableGrantedLegacyClaimDocument(args: {
  accessTenantId: string;
  db: DatabaseClient;
  documentId: string;
  session: SessionDTO;
}): Promise<GrantedLegacyClaimDocument | null> {
  const [row] = await args.db
    .select({
      doc: claimDocuments,
      claimOwnerId: claims.userId,
      claimBranchId: claims.branchId,
      claimStaffId: claims.staffId,
      claimAgentId: claims.agentId,
    })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(eq(claimDocuments.id, args.documentId));
  if (!row?.doc?.claimId) return null;

  const allowed = await hasDurableCaseScopedDocumentGrant({
    accessTenantId: args.accessTenantId,
    actorId: args.session.user.id,
    caseId: row.doc.claimId,
    db: args.db,
    documentClass: row.doc.category,
    homeTenantId: row.doc.tenantId,
  });
  return allowed ? row : null;
}
