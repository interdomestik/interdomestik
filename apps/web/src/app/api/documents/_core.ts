import { ApiErrorCode } from '@/core-contracts';
import { claimDocuments, claims, documents } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

// Define DB Interface (minimal part of Drizzle we use)
export interface DB {
  select: (args?: any) => any;
}

export interface DocumentAccessDeps {
  db: any; // Injected Drizzle DB instance
  storage: {
    createSignedUrl: (
      bucket: string,
      path: string,
      expiresIn: number
    ) => Promise<{ signedUrl?: string; error?: any }>;
    download: (bucket: string, path: string) => Promise<{ data?: Blob; error?: any }>;
  };
}

type SessionDTO = {
  user: {
    id: string;
    branchId?: string | null;
    role?: string | null;
    tenantId?: string | null;
  };
};

type DocumentRow = {
  id: string;
  claimId: string | null;
  bucket: string;
  filePath: string;
  uploadedBy: string | null;
  name: string | null;
  fileType: string | null;
  fileSize: number | null;
};

type DocumentAccessMode = 'signed_url' | 'download';

export type DocumentAccessResult =
  | { ok: true; document: DocumentRow; audit: AuditContext }
  | { ok: false; code: ApiErrorCode; message?: string };

type AuditContext = {
  action: string;
  entityType: 'claim_document';
  entityId: string;
  actorRole: string | null;
  metadata: Record<string, unknown>;
};

function isFullTenantClaimsRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'tenant_admin' || role === 'super_admin';
}

function isScopedClaimReaderRole(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'branch_manager';
}

function hasScopedClaimReadAccess(args: {
  branchId?: string | null;
  claim: { branchId?: string | null; staffId?: string | null; userId: string | null };
  role: string | null | undefined;
  userId: string;
}): boolean {
  const branchId = args.branchId ?? null;

  if (args.role === 'branch_manager') {
    return branchId !== null && args.claim.branchId === branchId;
  }

  if (branchId !== null) {
    return args.claim.branchId === branchId;
  }

  return args.claim.staffId === args.userId || args.claim.staffId == null;
}

export function safeFilename(value: string) {
  return value.replaceAll(/[\r\n"]/g, '_');
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
  storagePath: string;
  uploadedBy: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
}): DocumentRow {
  return {
    id: polyDoc.id,
    claimId: null,
    bucket: 'claim-evidence',
    filePath: polyDoc.storagePath,
    uploadedBy: polyDoc.uploadedBy,
    name: polyDoc.fileName,
    fileType: polyDoc.mimeType,
    fileSize: polyDoc.fileSize,
  };
}

function buildDocumentAudit(args: {
  actorRole: string | null | undefined;
  disposition: 'inline' | 'attachment';
  document: DocumentRow;
  documentId: string;
  mode: DocumentAccessMode;
}): AuditContext {
  const { actorRole, disposition, document, documentId, mode } = args;
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
    entityType: 'claim_document',
    entityId: documentId,
    actorRole: actorRole ?? null,
    metadata,
  };
}

async function canReadPolymorphicClaimDocument(args: {
  db: any;
  polyDoc: { entityId: string; entityType: string; uploadedBy: string | null };
  session: SessionDTO;
  tenantId: string;
  userRole: string | undefined;
}): Promise<boolean> {
  const { db, polyDoc, session, tenantId, userRole } = args;

  if (isFullTenantClaimsRole(userRole)) {
    return true;
  }

  if (polyDoc.uploadedBy === session.user.id) {
    return true;
  }

  if (!isScopedClaimReaderRole(userRole) || polyDoc.entityType !== 'claim') {
    return false;
  }

  const [claimRow] = await db
    .select({
      claimOwnerId: claims.userId,
      claimBranchId: claims.branchId,
      claimStaffId: claims.staffId,
    })
    .from(claims)
    .where(and(eq(claims.id, polyDoc.entityId), eq(claims.tenantId, tenantId)));

  if (!claimRow) {
    return false;
  }

  return hasScopedClaimReadAccess({
    branchId: session.user.branchId ?? null,
    claim: {
      branchId: claimRow.claimBranchId ?? null,
      staffId: claimRow.claimStaffId ?? null,
      userId: claimRow.claimOwnerId ?? null,
    },
    role: userRole,
    userId: session.user.id,
  });
}

function canReadLegacyClaimDocument(args: {
  claim: { branchId: string | null; ownerId: string | null; staffId: string | null };
  document: DocumentRow;
  session: SessionDTO;
  userRole: string | undefined;
}): boolean {
  const { claim, document, session, userRole } = args;

  if (isFullTenantClaimsRole(userRole)) {
    return true;
  }

  if (document.uploadedBy === session.user.id || claim.ownerId === session.user.id) {
    return true;
  }

  if (!isScopedClaimReaderRole(userRole)) {
    return false;
  }

  return hasScopedClaimReadAccess({
    branchId: session.user.branchId ?? null,
    claim: {
      branchId: claim.branchId,
      staffId: claim.staffId,
      userId: claim.ownerId,
    },
    role: userRole,
    userId: session.user.id,
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
  const tenantId = ensureTenantId(session);
  const { db } = deps;
  const userRole = (session.user.role as string | undefined) ?? undefined;
  const finalDisposition = getFinalDisposition(disposition);

  // 1. Try Polymorphic Documents Table
  const [polyDoc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)));

  if (polyDoc) {
    const canRead = await canReadPolymorphicClaimDocument({
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
      audit: buildDocumentAudit({
        actorRole: userRole,
        disposition: finalDisposition,
        document,
        documentId,
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
    })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(and(eq(claimDocuments.id, documentId), eq(claimDocuments.tenantId, tenantId)));

  if (!row?.doc) {
    return { ok: false, code: 'NOT_FOUND', message: 'Document not found' };
  }

  const doc = row.doc as unknown as DocumentRow;
  const canRead = canReadLegacyClaimDocument({
    claim: {
      branchId: row.claimBranchId ?? null,
      ownerId: row.claimOwnerId ?? null,
      staffId: row.claimStaffId ?? null,
    },
    document: doc,
    session,
    userRole,
  });

  if (!canRead) {
    return { ok: false, code: 'FORBIDDEN', message: 'Forbidden' };
  }

  return {
    ok: true,
    document: doc,
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
  deps: DocumentAccessDeps;
}): Promise<{ ok: true; signedUrl: string } | { ok: false }> {
  const { bucket, filePath, expiresInSeconds, deps } = args;
  const { signedUrl, error } = await deps.storage.createSignedUrl(
    bucket,
    filePath,
    expiresInSeconds
  );

  if (error || !signedUrl) return { ok: false };
  return { ok: true, signedUrl };
}

export async function downloadStorageFileCore(args: {
  bucket: string;
  filePath: string;
  deps: DocumentAccessDeps;
}): Promise<{ ok: true; data: Blob } | { ok: false }> {
  const { bucket, filePath, deps } = args;
  const { data, error } = await deps.storage.download(bucket, filePath);

  if (error || !data) return { ok: false };
  return { ok: true, data };
}
