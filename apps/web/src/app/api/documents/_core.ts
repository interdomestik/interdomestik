import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { appendCaseGrantDocumentAudit } from '@interdomestik/database';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { ensureAccessTenantId } from '@interdomestik/shared-auth';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import type { TenantStorageFamily } from '@/lib/storage/tenant-prefix';
import {
  getFinalDisposition,
  type DocumentAccessDeps,
  type DocumentAccessMode,
  type DocumentAccessResult,
  type DocumentAuditLogger,
  type DocumentReadArgs,
  type SessionDTO,
} from './document-access-model';
import { readCrossGrantDocumentAccess, readLocalDocumentAccess } from './document-access-reads';
import { deniesClaimDocumentContent } from './branch-manager-document-boundary';

export {
  buildContentDispositionHeader,
  encodeContentDispositionFilename,
  safeFilename,
  DOCUMENT_ACCESS_STATUS_BY_CODE,
} from './document-access-model';
export type {
  DocumentAccessDeps,
  DocumentAccessResult,
  DocumentAuditLogger,
  DocumentReadClient,
} from './document-access-model';

// Document access audits are written under the request session's own tenant authority (its access
// tenant), resolved from the request headers and bound to the session the route already holds.
async function documentAuditAuthority(
  headers: Headers,
  session: SessionDTO
): Promise<TenantAuthority | null> {
  try {
    const authorized = await authorizeSessionTenant(headers);
    return authorized?.session.user.id === session.user.id ? authorized.authority : null;
  } catch {
    return null;
  }
}

export async function logDeniedDocumentAccess(args: {
  access: Extract<DocumentAccessResult, { ok: false }>;
  documentId: string;
  headers: Headers;
  logAuditEvent: DocumentAuditLogger;
  session: SessionDTO;
  tenantId?: string | null;
}): Promise<void> {
  if (args.access.code !== 'FORBIDDEN') {
    return;
  }
  const authority = await documentAuditAuthority(args.headers, args.session);
  if (!authority) {
    console.error('[Audit] document.forbidden not recorded: no session tenant authority');
    return;
  }

  await args.logAuditEvent({
    authority,
    actorId: args.session.user.id,
    actorRole: args.session.user.role || null,
    action: 'document.forbidden',
    entityType: 'claim_document',
    entityId: args.documentId,
    metadata: { error: args.access.message },
    headers: args.headers,
  });
}

export async function logAllowedDocumentAccess(args: {
  access: Extract<DocumentAccessResult, { ok: true }>;
  headers: Headers;
  logAuditEvent: DocumentAuditLogger;
  session: SessionDTO;
  tenantId?: string | null;
}): Promise<void> {
  const authority = await documentAuditAuthority(args.headers, args.session);
  if (!authority) {
    console.error(`[Audit] ${args.access.audit.action} not recorded: no session tenant authority`);
    return;
  }
  // A document read through a cross-tenant case grant belongs to its home tenant, which records
  // the read; the fixed append confirms the reader's grant for the document's case first.
  if (args.access.tenantId !== readTenantAuthority(authority).tenantId) {
    try {
      const recorded = await appendCaseGrantDocumentAudit(authority, {
        homeTenantId: args.access.tenantId,
        documentId: args.access.audit.entityId,
        // The read's own result names its table: a claim_documents row always carries its claim,
        // a polymorphic documents row is built without one.
        source: args.access.document.claimId === null ? 'documents' : 'claim_documents',
        action: args.access.audit.action,
        entityType: args.access.audit.entityType,
        metadata: args.access.audit.metadata,
      });
      if (!recorded) {
        console.error(`[Audit] ${args.access.audit.action} not recorded: case grant not confirmed`);
      }
    } catch (error) {
      console.error(`[Audit] ${args.access.audit.action} not recorded:`, error);
    }
    return;
  }

  await args.logAuditEvent({
    authority,
    actorId: args.session.user.id,
    actorRole: args.access.audit.actorRole,
    action: args.access.audit.action,
    entityType: args.access.audit.entityType,
    entityId: args.access.audit.entityId,
    metadata: args.access.audit.metadata,
    headers: args.headers,
  });
}

export async function getDocumentAccessCore(args: {
  /** The request session's authority, from the same authorization result as `session`. */
  authority: TenantAuthority;
  session: SessionDTO;
  documentId: string;
  mode: DocumentAccessMode;
  disposition?: 'inline' | 'attachment';
  deps: DocumentAccessDeps;
}): Promise<DocumentAccessResult> {
  const { authority, session, documentId, mode, disposition, deps } = args;
  if (deniesClaimDocumentContent(session.user.role)) {
    return { ok: false, code: 'FORBIDDEN', message: 'Forbidden' };
  }
  const tenantId = ensureAccessTenantId(session);
  const userRole = (session.user.role as string | undefined) ?? undefined;
  const finalDisposition = getFinalDisposition(disposition);
  const read: DocumentReadArgs = {
    documentId,
    finalDisposition,
    mode,
    session,
    tenantId,
    userRole,
  };

  // 1-2. Normal-tenant document, claim, and grant reads share one tenant-bound transaction under
  // the session authority: its tenant and access tenant are the session's access tenant, its role
  // the session role.
  const localAccess = await withTenantAuthority(authority, tx =>
    readLocalDocumentAccess({
      db: tx,
      documentId,
      finalDisposition,
      mode,
      session,
      tenantId,
      userRole,
    })
  );
  if (localAccess) return localAccess;

  // 3. The cross-tenant fallback runs only after that transaction is released, so its own
  // grant-scoped transactions never wait on a second pooled connection held by this request.
  return readCrossGrantDocumentAccess({ ...read, db: deps.db });
}

export async function createSignedDownloadUrlCore(args: {
  bucket: string;
  downloadName?: string;
  filePath: string;
  expiresInSeconds: number;
  family: TenantStorageFamily;
  deps: DocumentAccessDeps;
  tenantId: string;
}): Promise<{ ok: true; signedUrl: string } | { ok: false }> {
  const { bucket, downloadName, filePath, expiresInSeconds, family, deps, tenantId } = args;
  const { signedUrl, error } = await deps.storage.createSignedUrl(
    bucket,
    filePath,
    expiresInSeconds,
    { downloadName, family, tenantId }
  );

  if (error || !signedUrl) return { ok: false };
  return { ok: true, signedUrl };
}
export async function downloadStorageFileCore(args: {
  bucket: string;
  filePath: string;
  family: TenantStorageFamily;
  deps: DocumentAccessDeps;
  tenantId: string;
}): Promise<{ ok: true; data: Blob } | { ok: false }> {
  const { bucket, filePath, family, deps, tenantId } = args;
  const { data, error } = await deps.storage.download(bucket, filePath, { family, tenantId });

  if (error || !data) return { ok: false };
  return { ok: true, data };
}
