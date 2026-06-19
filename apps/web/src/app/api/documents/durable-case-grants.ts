import { type TenantTransaction, withTenantContext } from '@interdomestik/database';
import { caseScopedAccessGrants } from '@interdomestik/database/schema';
import { and, eq, isNull, ne, or, gt } from 'drizzle-orm';
import {
  canUseCaseScopedDocumentGrant,
  type CaseScopedDocumentClass,
} from '@interdomestik/shared-auth';

import type { DocumentAccessDeps } from './_core';

type GrantReader = DocumentAccessDeps['db'] | TenantTransaction;

const APPROVED_DURABLE_DOCUMENT_CLASSES = new Set<CaseScopedDocumentClass>([
  'correspondence',
  'contract',
  'evidence',
  'legal',
  'receipt',
]);

export type CrossGrantContext = {
  homeTenantId: string;
  caseId: string;
  documentClasses: readonly string[];
};

/** Returns active, non-revoked, non-expired grants for an actor where the home tenant
 *  differs from the actor's own access tenant (genuine cross-tenant grants). */
export async function findActorCrossGrantContexts(args: {
  actorId: string;
  accessTenantId: string;
  db: DocumentAccessDeps['db'];
  now?: Date;
}): Promise<CrossGrantContext[]> {
  return withGrantReadContext(args.accessTenantId, tx => selectActorCrossGrantContexts(tx, args));
}

async function selectActorCrossGrantContexts(
  db: GrantReader,
  args: {
    actorId: string;
    accessTenantId: string;
    now?: Date;
  }
): Promise<CrossGrantContext[]> {
  const now = args.now ?? new Date();
  const rows = await db
    .select({
      tenantId: caseScopedAccessGrants.tenantId,
      caseId: caseScopedAccessGrants.caseId,
      documentClasses: caseScopedAccessGrants.documentClasses,
    })
    .from(caseScopedAccessGrants)
    .where(
      and(
        eq(caseScopedAccessGrants.accessTenantId, args.accessTenantId),
        ne(caseScopedAccessGrants.tenantId, args.accessTenantId),
        eq(caseScopedAccessGrants.actorId, args.actorId),
        isNull(caseScopedAccessGrants.revokedAt),
        or(isNull(caseScopedAccessGrants.expiresAt), gt(caseScopedAccessGrants.expiresAt, now))
      )
    );
  return rows.map(r => ({
    homeTenantId: r.tenantId,
    caseId: r.caseId,
    documentClasses: r.documentClasses,
  }));
}

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

  const grants = await withGrantReadContext(args.accessTenantId, tx => selectGrantRows(tx, args));
  return canUseCaseScopedDocumentGrant({
    accessTenantId: args.accessTenantId,
    actorId: args.actorId,
    caseId: args.caseId,
    documentClass,
    grants,
    now: args.now,
  });
}

async function selectGrantRows(
  db: GrantReader,
  args: {
    accessTenantId: string;
    actorId: string;
    caseId: string;
    homeTenantId?: string | null;
  }
) {
  return db
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
}

export function toApprovedDurableDocumentClass(value: unknown): CaseScopedDocumentClass | null {
  if (typeof value !== 'string') return null;
  return APPROVED_DURABLE_DOCUMENT_CLASSES.has(value as CaseScopedDocumentClass)
    ? (value as CaseScopedDocumentClass)
    : null;
}

function withGrantReadContext<T>(
  accessTenantId: string,
  action: (tx: TenantTransaction) => Promise<T>
): Promise<T> {
  return withTenantContext({ tenantId: accessTenantId, accessTenantId }, action);
}
