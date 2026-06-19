import { claimDocuments, claims, documents } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

import type { DocumentAccessDeps } from './_core';
import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';

type DatabaseClient = DocumentAccessDeps['db'];
type PolyDoc = typeof documents.$inferSelect;
type LegacyDoc = typeof claimDocuments.$inferSelect;

type CrossGrantDoc =
  | { kind: 'legacy'; doc: LegacyDoc; homeTenantId: string }
  | { kind: 'poly'; doc: PolyDoc; homeTenantId: string };

export async function lookupCrossGrantDoc(args: {
  accessTenantId: string;
  actorId: string;
  db: DatabaseClient;
  documentId: string;
}): Promise<CrossGrantDoc | null> {
  const polyDoc = await lookupPoly(args);
  if (polyDoc) return polyDoc;
  return lookupLegacy(args);
}

async function lookupPoly(args: {
  accessTenantId: string;
  actorId: string;
  db: DatabaseClient;
  documentId: string;
}): Promise<CrossGrantDoc | null> {
  const [doc] = await args.db.select().from(documents).where(eq(documents.id, args.documentId));
  if (!doc) return null;
  if (doc.entityType !== 'claim') return null;
  const allowed = await hasDurableCaseScopedDocumentGrant({
    accessTenantId: args.accessTenantId,
    actorId: args.actorId,
    caseId: doc.entityId,
    db: args.db,
    documentClass: doc.category,
    homeTenantId: doc.tenantId,
  });
  return allowed ? { kind: 'poly', doc, homeTenantId: doc.tenantId } : null;
}

async function lookupLegacy(args: {
  accessTenantId: string;
  actorId: string;
  db: DatabaseClient;
  documentId: string;
}): Promise<CrossGrantDoc | null> {
  const [row] = await args.db
    .select({ doc: claimDocuments, claimId: claims.id })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(eq(claimDocuments.id, args.documentId));
  if (!row?.doc?.claimId || !row.claimId) return null;
  const allowed = await hasDurableCaseScopedDocumentGrant({
    accessTenantId: args.accessTenantId,
    actorId: args.actorId,
    caseId: row.doc.claimId,
    db: args.db,
    documentClass: row.doc.category,
    homeTenantId: row.doc.tenantId,
  });
  return allowed ? { kind: 'legacy', doc: row.doc, homeTenantId: row.doc.tenantId } : null;
}
