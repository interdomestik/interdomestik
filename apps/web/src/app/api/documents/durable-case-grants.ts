import { type TenantTransaction } from '@interdomestik/database';
import { caseScopedAccessGrants } from '@interdomestik/database/schema';
import { and, eq, isNull, ne, or, gt, sql } from 'drizzle-orm';
import { canUseCaseScopedDocumentGrant } from '@interdomestik/shared-auth';

import type { DocumentAccessDeps } from './_core';
import { toApprovedDurableDocumentClass } from './durable-document-classes';

type GrantReader = DocumentAccessDeps['db'] | TenantTransaction;

export type CrossGrantContext = {
  homeTenantId: string;
  caseId: string;
  documentClasses: readonly string[];
};

export async function findActorCrossGrantContexts(args: {
  actorId: string;
  accessTenantId: string;
  db: GrantReader;
  now?: Date;
}): Promise<CrossGrantContext[]> {
  return withGrantReadContext(args.db, args.accessTenantId, tx =>
    selectActorCrossGrantContexts(tx, args)
  );
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
  db: GrantReader;
  documentClass: unknown;
  homeTenantId?: string | null;
  now?: Date;
}): Promise<boolean> {
  const documentClass = toApprovedDurableDocumentClass(args.documentClass);
  if (!documentClass) {
    return false;
  }

  const grants = await withGrantReadContext(args.db, args.accessTenantId, tx =>
    selectGrantRows(tx, args)
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

async function withGrantReadContext<T>(
  db: GrantReader,
  accessTenantId: string,
  action: (tx: GrantReader) => Promise<T>
): Promise<T> {
  if (!hasTransaction(db)) return action(db);

  return db.transaction(async tx => {
    await tx.execute(sql`set local row_security = on`);
    await tx.execute(sql`select set_config('app.current_tenant_id', ${accessTenantId}, true)`);
    await tx.execute(
      sql`select set_config('app.current_access_tenant_id', ${accessTenantId}, true)`
    );
    return action(tx);
  });
}

function hasTransaction(db: GrantReader): db is DocumentAccessDeps['db'] {
  return typeof (db as { transaction?: unknown }).transaction === 'function';
}
