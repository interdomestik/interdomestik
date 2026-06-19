import { caseScopedAccessGrants } from '@interdomestik/database/schema';
import {
  canUseCaseScopedDocumentGrant,
  type CaseScopedDocumentClass,
} from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import type { DocumentAccessDeps } from './_core';

const APPROVED_DURABLE_DOCUMENT_CLASSES = new Set<CaseScopedDocumentClass>([
  'correspondence',
  'contract',
  'evidence',
  'legal',
  'receipt',
]);

export async function hasDurableCaseScopedDocumentGrant(args: {
  accessTenantId: string;
  actorId: string;
  caseId: string;
  db: DocumentAccessDeps['db'];
  documentClass: unknown;
  homeTenantId?: string | null;
  now?: Date;
}): Promise<boolean> {
  const documentClass = toApprovedDurableDocumentClass(args.documentClass);
  if (!documentClass) {
    return false;
  }

  const grants = await args.db
    .select({
      accessTenantId: caseScopedAccessGrants.accessTenantId,
      actorId: caseScopedAccessGrants.actorId,
      caseId: caseScopedAccessGrants.caseId,
      documentClasses: caseScopedAccessGrants.documentClasses,
      expiresAt: caseScopedAccessGrants.expiresAt,
      revokedAt: caseScopedAccessGrants.revokedAt,
    })
    .from(caseScopedAccessGrants)
    .where(
      and(
        eq(caseScopedAccessGrants.accessTenantId, args.accessTenantId),
        eq(caseScopedAccessGrants.actorId, args.actorId),
        eq(caseScopedAccessGrants.caseId, args.caseId),
        ...(args.homeTenantId ? [eq(caseScopedAccessGrants.tenantId, args.homeTenantId)] : [])
      )
    );

  return canUseCaseScopedDocumentGrant({
    accessTenantId: args.accessTenantId,
    actorId: args.actorId,
    caseId: args.caseId,
    documentClass,
    grants,
    now: args.now,
  });
}

function toApprovedDurableDocumentClass(value: unknown): CaseScopedDocumentClass | null {
  if (typeof value !== 'string') return null;
  return APPROVED_DURABLE_DOCUMENT_CLASSES.has(value as CaseScopedDocumentClass)
    ? (value as CaseScopedDocumentClass)
    : null;
}
