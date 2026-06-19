import type { TenantTransaction } from '@interdomestik/database';
import { claimDocuments, claims, documents } from '@interdomestik/database/schema';
import { and, eq, sql } from 'drizzle-orm';

import type { DocumentAccessDeps } from './_core';
import {
  findActorCrossGrantContexts,
  hasDurableCaseScopedDocumentGrant,
  type CrossGrantContext,
} from './durable-case-grants';

type DatabaseClient = DocumentAccessDeps['db'];
type DocumentReadDb = DatabaseClient | TenantTransaction;
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
  const contexts = await findActorCrossGrantContexts(args);
  for (const grantContext of contexts) {
    const result = await withDocumentReadContext(args, grantContext.homeTenantId, tx =>
      lookupGrantedDocument({ ...args, db: tx, grantContext })
    );
    if (result) return result;
  }
  return null;
}

async function lookupGrantedDocument(args: {
  accessTenantId: string;
  actorId: string;
  db: DocumentReadDb;
  documentId: string;
  grantContext: CrossGrantContext;
}): Promise<CrossGrantDoc | null> {
  const polyDoc = await lookupPoly(args);
  if (polyDoc) return polyDoc;
  return lookupLegacy(args);
}

async function lookupPoly(args: {
  accessTenantId: string;
  actorId: string;
  db: DocumentReadDb;
  documentId: string;
  grantContext: CrossGrantContext;
}): Promise<CrossGrantDoc | null> {
  const [doc] = await args.db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, args.documentId),
        eq(documents.tenantId, args.grantContext.homeTenantId),
        eq(documents.entityType, 'claim'),
        eq(documents.entityId, args.grantContext.caseId)
      )
    );
  if (!doc) return null;
  if (doc.entityType !== 'claim' || doc.entityId !== args.grantContext.caseId) return null;
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
  db: DocumentReadDb;
  documentId: string;
  grantContext: CrossGrantContext;
}): Promise<CrossGrantDoc | null> {
  const [row] = await args.db
    .select({ doc: claimDocuments, claimId: claims.id })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(
      and(
        eq(claimDocuments.id, args.documentId),
        eq(claimDocuments.tenantId, args.grantContext.homeTenantId),
        eq(claimDocuments.claimId, args.grantContext.caseId)
      )
    );
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

async function withDocumentReadContext<T>(
  args: { accessTenantId: string; db: DatabaseClient },
  homeTenantId: string,
  action: (tx: DocumentReadDb) => Promise<T>
): Promise<T> {
  if (!hasTransaction(args.db)) return action(args.db);
  return args.db.transaction(async tx => {
    await tx.execute(sql`set local row_security = on`);
    await tx.execute(sql`select set_config('app.current_tenant_id', ${homeTenantId}, true)`);
    await tx.execute(
      sql`select set_config('app.current_access_tenant_id', ${args.accessTenantId}, true)`
    );
    return action(tx);
  });
}

function hasTransaction(db: DocumentReadDb): db is DatabaseClient {
  return typeof (db as { transaction?: unknown }).transaction === 'function';
}
