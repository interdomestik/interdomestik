import { ApiErrorCode } from '@/core-contracts';
import type { AuditEvent } from '@/lib/audit';
import type { TenantStorageFamily } from '@/lib/storage/tenant-prefix';
import type * as DatabaseModule from '@interdomestik/database';
import { claimDocuments, claims, documents } from '@interdomestik/database/schema';
import {
  ensureAccessTenantId,
  type CaseScopedAccessGrant,
  type CaseScopedDocumentClass,
} from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

import { canReadLegacyClaimDocument } from './claim-document-access';
import { lookupCrossGrantDoc } from './cross-tenant-document-lookup';
import { canReadPolymorphicDocument } from './polymorphic-document-access';

type DatabaseClient = typeof DatabaseModule.db;

export interface DocumentAccessDeps {
  db: DatabaseClient;
  storage: {
    createSignedUrl: (
      bucket: string,
      path: string,
      expiresIn: number,
      options: { family: TenantStorageFamily; tenantId: string }
    ) => Promise<{ signedUrl?: string; error?: unknown }>;
    download: (
      bucket: string,
      path: string,
      options: { family: TenantStorageFamily; tenantId: string }
    ) => Promise<{ data?: Blob; error?: unknown }>;
  };
}

type SessionDTO = {
  user: {
    id: string;
    accessTenantId?: string | null;
    caseScopedAccessGrants?: readonly CaseScopedAccessGrant[] | null;
    branchId?: string | null;
    role?: string | null;
    tenantId?: string | null;
  };
};

type DocumentRow = {
  id: string;
  claimId: string | null;
  category?: GrantDocumentClass | null;
  bucket: string;
  filePath: string;
  uploadedBy: string | null;
  name: string | null;
  fileType: string | null;
  fileSize: number | null;
};
type DocumentAccessMode = 'signed_url' | 'download';
type GrantDocumentClass = CaseScopedDocumentClass;
export type DocumentAccessResult =
  | {
      ok: true;
      document: DocumentRow;
      audit: AuditContext;
      storageFamily: TenantStorageFamily;
      tenantId: string;
    }
  | { ok: false; code: ApiErrorCode; message?: string };

export const DOCUMENT_ACCESS_STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  RATE_LIMIT: 429,
  INTERNAL_ERROR: 500,
  TIMEOUT: 504,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
};

export type DocumentAuditLogger = (event: AuditEvent) => Promise<void>;

type AuditContext = {
  action: string;
  entityType: 'claim_document' | 'policy_document';
  entityId: string;
  actorRole: string | null;
  metadata: Record<string, unknown>;
};

export function safeFilename(value: string) {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\r\n"\\]|[^\x20-\x7E]/g, '_')
    .trim();

  return ascii || 'document';
}

const RFC_5987_EXTRA_CHARS = /['()*]/g;

export function encodeContentDispositionFilename(value: string) {
  return encodeURIComponent(value).replace(
    RFC_5987_EXTRA_CHARS,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function buildContentDispositionHeader(args: {
  disposition: 'inline' | 'attachment';
  filename: string;
}) {
  const fallbackFilename = safeFilename(args.filename || 'document');
  const encodedFilename = encodeContentDispositionFilename(args.filename || 'document');

  return `${args.disposition}; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function getFinalDisposition(disposition?: 'inline' | 'attachment'): 'inline' | 'attachment' {
  return disposition === 'inline' ? 'inline' : 'attachment';
}

function getDocumentAction(disposition: 'inline' | 'attachment', mode: DocumentAccessMode): string {
  if (mode === 'signed_url') {
    return 'document.signed_url_issued';
  }

  return disposition === 'inline' ? 'document.view' : 'document.download';
}

function buildPolymorphicDocument(polyDoc: {
  id: string;
  entityType: string;
  storagePath: string;
  uploadedBy: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
}): DocumentRow {
  return {
    id: polyDoc.id,
    claimId: null,
    bucket: getPolymorphicDocumentBucket(polyDoc.entityType),
    filePath: polyDoc.storagePath,
    uploadedBy: polyDoc.uploadedBy,
    name: polyDoc.fileName,
    fileType: polyDoc.mimeType,
    fileSize: polyDoc.fileSize,
  };
}

function getPolymorphicDocumentBucket(entityType: string): string {
  if (entityType === 'policy') {
    return process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';
  }

  return process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';
}

function getPolymorphicDocumentAuditEntityType(entityType: string): AuditContext['entityType'] {
  if (entityType === 'policy') {
    return 'policy_document';
  }

  return 'claim_document';
}

function getStorageFamilyForDocument(document: DocumentRow): TenantStorageFamily {
  return document.bucket === (process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies')
    ? 'policies'
    : 'claims';
}

function buildDocumentAudit(args: {
  actorRole: string | null | undefined;
  disposition: 'inline' | 'attachment';
  document: DocumentRow;
  documentId: string;
  entityType?: AuditContext['entityType'];
  mode: DocumentAccessMode;
}): AuditContext {
  const {
    actorRole,
    disposition,
    document,
    documentId,
    entityType = 'claim_document',
    mode,
  } = args;
  const metadata =
    mode === 'signed_url'
      ? {
          claimId: document.claimId,
          bucket: document.bucket,
          filePath: document.filePath,
          expiresInSeconds: 300,
        }
      : {
          claimId: document.claimId,
          bucket: document.bucket,
          filePath: document.filePath,
          fileType: document.fileType,
          fileSize: document.fileSize,
          disposition,
        };

  return {
    action: getDocumentAction(disposition, mode),
    entityType,
    entityId: documentId,
    actorRole: actorRole ?? null,
    metadata,
  };
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

export async function getDocumentAccessCore(args: {
  session: SessionDTO;
  documentId: string;
  mode: DocumentAccessMode;
  disposition?: 'inline' | 'attachment';
  deps: DocumentAccessDeps;
}): Promise<DocumentAccessResult> {
  const { session, documentId, mode, disposition, deps } = args;
  const tenantId = ensureAccessTenantId(session);
  const { db } = deps;
  const userRole = (session.user.role as string | undefined) ?? undefined;
  const finalDisposition = getFinalDisposition(disposition);

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
    .where(and(eq(claimDocuments.id, documentId), eq(claimDocuments.tenantId, tenantId)));

  if (!row?.doc) {
    // 3. Cross-tenant fallback for jurisdiction-handoff recovery/legal actors.
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
    tenantId,
    audit: buildDocumentAudit({
      actorRole: userRole,
      disposition: finalDisposition,
      document: doc,
      documentId,
      mode,
    }),
  };
}

export async function createSignedDownloadUrlCore(args: {
  bucket: string;
  filePath: string;
  expiresInSeconds: number;
  family: TenantStorageFamily;
  deps: DocumentAccessDeps;
  tenantId: string;
}): Promise<{ ok: true; signedUrl: string } | { ok: false }> {
  const { bucket, filePath, expiresInSeconds, family, deps, tenantId } = args;
  const { signedUrl, error } = await deps.storage.createSignedUrl(
    bucket,
    filePath,
    expiresInSeconds,
    { family, tenantId }
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
