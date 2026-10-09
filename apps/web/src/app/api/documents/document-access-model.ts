import { ApiErrorCode } from '@/core-contracts';
import type { AuditEvent } from '@/lib/audit';
import type { TenantStorageFamily } from '@/lib/storage/tenant-prefix';
import type * as DatabaseModule from '@interdomestik/database';
import {
  type CaseScopedAccessGrant,
  type CaseScopedDocumentClass,
} from '@interdomestik/shared-auth';

export type DatabaseClient = typeof DatabaseModule.db;
/** Normal-tenant reads accept the tenant-bound transaction; the base client stays for fallback. */
export type DocumentReadClient = DatabaseClient | DatabaseModule.TenantTransaction;
export type DocumentTenantContextRunner = <T>(
  context: { accessTenantId: string; role: string | null; tenantId: string },
  action: (tx: DocumentReadClient) => Promise<T>
) => Promise<T>;

export interface DocumentAccessDeps {
  db: DatabaseClient;
  /**
   * Opens the tenant-bound transaction for normal-tenant document, claim, and grant reads.
   * Defaults to the database package `withTenantContext`; tests inject an explicit runner.
   */
  withTenantContext?: DocumentTenantContextRunner;
  storage: {
    createSignedUrl: (
      bucket: string,
      path: string,
      expiresIn: number,
      options: { downloadName?: string; family: TenantStorageFamily; tenantId: string }
    ) => Promise<{ signedUrl?: string; error?: unknown }>;
    download: (
      bucket: string,
      path: string,
      options: { family: TenantStorageFamily; tenantId: string }
    ) => Promise<{ data?: Blob; error?: unknown }>;
  };
}

export type SessionDTO = {
  user: {
    id: string;
    accessTenantId?: string | null;
    caseScopedAccessGrants?: readonly CaseScopedAccessGrant[] | null;
    branchId?: string | null;
    role?: string | null;
    tenantId?: string | null;
  };
};

export type DocumentRow = {
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
export type DocumentAccessMode = 'signed_url' | 'download';
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

export function getFinalDisposition(
  disposition?: 'inline' | 'attachment'
): 'inline' | 'attachment' {
  return disposition === 'inline' ? 'inline' : 'attachment';
}

function getDocumentAction(disposition: 'inline' | 'attachment', mode: DocumentAccessMode): string {
  if (mode === 'signed_url') {
    return 'document.signed_url_issued';
  }

  return disposition === 'inline' ? 'document.view' : 'document.download';
}

export function buildPolymorphicDocument(polyDoc: {
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

export function getPolymorphicDocumentAuditEntityType(
  entityType: string
): AuditContext['entityType'] {
  if (entityType === 'policy') {
    return 'policy_document';
  }

  return 'claim_document';
}

export function getStorageFamilyForDocument(document: DocumentRow): TenantStorageFamily {
  return document.bucket === (process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies')
    ? 'policies'
    : 'claims';
}

export function buildDocumentAudit(args: {
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

export type DocumentReadArgs = {
  documentId: string;
  finalDisposition: 'inline' | 'attachment';
  mode: DocumentAccessMode;
  session: SessionDTO;
  tenantId: string;
  userRole: string | undefined;
};
