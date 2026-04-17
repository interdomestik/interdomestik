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

  // 1. Try Polymorphic Documents Table
  const [polyDoc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)));

  if (polyDoc) {
    const userRole = (session.user.role as string | undefined) ?? undefined;
    const isPrivileged = isFullTenantClaimsRole(userRole);
    const isScopedClaimReader = userRole === 'staff' || userRole === 'branch_manager';
    const isUploader = polyDoc.uploadedBy === session.user.id;
    let isScopedClaimDocReader = false;

    if (isScopedClaimReader && polyDoc.entityType === 'claim') {
      const [claimRow] = await db
        .select({
          claimOwnerId: claims.userId,
          claimBranchId: claims.branchId,
          claimStaffId: claims.staffId,
        })
        .from(claims)
        .where(and(eq(claims.id, polyDoc.entityId), eq(claims.tenantId, tenantId)));

      if (claimRow) {
        isScopedClaimDocReader = hasScopedClaimReadAccess({
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
    }

    if (!isPrivileged && !isScopedClaimDocReader && !isUploader) {
      return { ok: false, code: 'FORBIDDEN', message: 'Forbidden' };
    }

    const finalDisposition = disposition === 'inline' ? 'inline' : 'attachment';

    return {
      ok: true,
      document: {
        id: polyDoc.id,
        claimId: null,
        bucket: 'claim-evidence',
        filePath: polyDoc.storagePath,
        uploadedBy: polyDoc.uploadedBy,
        name: polyDoc.fileName,
        fileType: polyDoc.mimeType,
        fileSize: polyDoc.fileSize,
      },
      audit: {
        action: finalDisposition === 'inline' ? 'document.view' : 'document.download',
        entityType: 'claim_document',
        entityId: documentId,
        actorRole: userRole ?? null,
        metadata: {
          bucket: 'claim-evidence',
          filePath: polyDoc.storagePath,
          fileType: polyDoc.mimeType,
          fileSize: polyDoc.fileSize,
          disposition: finalDisposition,
        },
      },
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
  const userRole = (session.user.role as string | undefined) ?? undefined;
  const isPrivileged = isFullTenantClaimsRole(userRole);
  const isScopedStaff =
    (userRole === 'staff' || userRole === 'branch_manager') &&
    hasScopedClaimReadAccess({
      branchId: session.user.branchId ?? null,
      claim: {
        branchId: row.claimBranchId ?? null,
        staffId: row.claimStaffId ?? null,
        userId: row.claimOwnerId ?? null,
      },
      role: userRole,
      userId: session.user.id,
    });
  const isClaimOwner = row.claimOwnerId === session.user.id;
  const isUploader = doc.uploadedBy === session.user.id;

  if (!isPrivileged && !isScopedStaff && !isClaimOwner && !isUploader) {
    return { ok: false, code: 'FORBIDDEN', message: 'Forbidden' };
  }

  if (mode === 'signed_url') {
    return {
      ok: true,
      document: doc,
      audit: {
        action: 'document.signed_url_issued',
        entityType: 'claim_document',
        entityId: documentId,
        actorRole: userRole ?? null,
        metadata: {
          claimId: doc.claimId,
          bucket: doc.bucket,
          filePath: doc.filePath,
          expiresInSeconds: 300,
        },
      },
    };
  }

  const finalDisposition = disposition === 'inline' ? 'inline' : 'attachment';
  return {
    ok: true,
    document: doc,
    audit: {
      action: finalDisposition === 'inline' ? 'document.view' : 'document.download',
      entityType: 'claim_document',
      entityId: documentId,
      actorRole: userRole ?? null,
      metadata: {
        claimId: doc.claimId,
        bucket: doc.bucket,
        filePath: doc.filePath,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        disposition: finalDisposition,
      },
    },
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
