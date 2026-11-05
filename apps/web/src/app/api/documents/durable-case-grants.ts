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
  // The callback receives only the read fields, never `args`, which carries the database handle.
  const { accessTenantId, actorId, now } = args;
  return withGrantReadContext(args.db, accessTenantId, tx =>
    selectActorCrossGrantContexts(tx, { accessTenantId, actorId, now })
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
  // db-access-guard: tenant-scoped -- reason: grant read context constrains accessTenantId, actor, active grant, and expiry predicates
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

type DurableGrantRequest = {
  accessTenantId: string;
  actorId: string;
  caseId: string;
  db: GrantReader;
  documentClass: unknown;
};
type DurableGrantFields = Omit<DurableGrantRequest, 'db'> & { homeTenantId: string | null };

/** Whether an active durable grant covers the document class, in any home tenant. Reads only the
 * request's own members: callers may hand it their tenant transaction inside the request. */
export async function hasDurableCaseScopedDocumentGrant(
  args: DurableGrantRequest
): Promise<boolean> {
  return checkDurableGrant(args.db, {
    accessTenantId: args.accessTenantId,
    actorId: args.actorId,
    caseId: args.caseId,
    documentClass: args.documentClass,
    homeTenantId: null,
  });
}

/** The same check restricted to grants issued by the document's home tenant. */
export async function hasDurableCaseScopedDocumentGrantInHomeTenant(
  args: DurableGrantRequest & { homeTenantId: string }
): Promise<boolean> {
  return checkDurableGrant(args.db, {
    accessTenantId: args.accessTenantId,
    actorId: args.actorId,
    caseId: args.caseId,
    documentClass: args.documentClass,
    homeTenantId: args.homeTenantId,
  });
}

async function checkDurableGrant(db: GrantReader, request: DurableGrantFields): Promise<boolean> {
  const documentClass = toApprovedDurableDocumentClass(request.documentClass);
  if (!documentClass) {
    return false;
  }

  const grants = await withGrantReadContext(db, request.accessTenantId, tx =>
    selectGrantRows(tx, request)
  );
  return canUseCaseScopedDocumentGrant({
    accessTenantId: request.accessTenantId,
    actorId: request.actorId,
    caseId: request.caseId,
    documentClass,
    grants,
  });
}

async function selectGrantRows(
  db: GrantReader,
  args: {
    accessTenantId: string;
    actorId: string;
    caseId: string;
    homeTenantId: string | null;
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

  // db-access-guard: tenant-scoped -- reason: sets row security and access-tenant GUCs before grant table reads
  return db.transaction(async tx => {
    // db-access-guard: tenant-scoped -- reason: enables RLS before case_scoped_access_grants reads
    await tx.execute(sql`set local row_security = on`);
    // db-access-guard: tenant-scoped -- reason: pins tenant context to validated accessTenantId for grant reads
    await tx.execute(sql`select set_config('app.current_tenant_id', ${accessTenantId}, true)`);
    // db-access-guard: tenant-scoped -- reason: pins access context to validated accessTenantId for grant RLS
    await tx.execute(
      sql`select set_config('app.current_access_tenant_id', ${accessTenantId}, true)`
    );
    return action(tx);
  });
}

function hasTransaction(db: GrantReader): db is DocumentAccessDeps['db'] {
  return typeof (db as { transaction?: unknown }).transaction === 'function';
}
