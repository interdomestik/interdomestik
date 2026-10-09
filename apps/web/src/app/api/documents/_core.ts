import { ensureAccessTenantId } from '@interdomestik/shared-auth';
import type { TenantStorageFamily } from '@/lib/storage/tenant-prefix';
import {
  getFinalDisposition,
  type DocumentAccessDeps,
  type DocumentAccessMode,
  type DocumentAccessResult,
  type DocumentAuditLogger,
  type DocumentReadArgs,
  type DocumentTenantContextRunner,
  type SessionDTO,
} from './document-access-model';
import { readCrossGrantDocumentAccess, readLocalDocumentAccess } from './document-access-reads';

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
  DocumentTenantContextRunner,
} from './document-access-model';

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

  await args.logAuditEvent({
    actorId: args.session.user.id,
    actorRole: args.session.user.role || null,
    tenantId: ensureAccessTenantId(args.session),
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
  await args.logAuditEvent({
    actorId: args.session.user.id,
    actorRole: args.access.audit.actorRole,
    tenantId: args.access.tenantId,
    action: args.access.audit.action,
    entityType: args.access.audit.entityType,
    entityId: args.access.audit.entityId,
    metadata: args.access.audit.metadata,
    headers: args.headers,
  });
}

// Loaded lazily so unit tests that inject a runner never open the real tenant database client.
const runWithDatabaseTenantContext: DocumentTenantContextRunner = (context, action) =>
  import('@interdomestik/database').then(({ withTenantContext }) =>
    withTenantContext(context, action)
  );

export async function getDocumentAccessCore(args: {
  session: SessionDTO;
  documentId: string;
  mode: DocumentAccessMode;
  disposition?: 'inline' | 'attachment';
  deps: DocumentAccessDeps;
}): Promise<DocumentAccessResult> {
  const { session, documentId, mode, disposition, deps } = args;
  const tenantId = ensureAccessTenantId(session);
  const userRole = (session.user.role as string | undefined) ?? undefined;
  const finalDisposition = getFinalDisposition(disposition);
  const runInTenantContext = deps.withTenantContext ?? runWithDatabaseTenantContext;
  const read: DocumentReadArgs = {
    documentId,
    finalDisposition,
    mode,
    session,
    tenantId,
    userRole,
  };

  // 1-2. Normal-tenant document, claim, and grant reads share one tenant-bound transaction under
  // the effective access tenant and the trusted session role.
  const localAccess = await runInTenantContext(
    { accessTenantId: tenantId, role: userRole ?? null, tenantId },
    tx => readLocalDocumentAccess({ ...read, db: tx })
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
