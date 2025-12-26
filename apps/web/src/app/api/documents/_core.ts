import { claimDocuments, claims, createAdminClient, db } from '@interdomestik/database';
import { eq } from 'drizzle-orm';

type Session = {
  user: {
    id: string;
    role?: string | null;
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

type ForbiddenResult = {
  ok: false;
  status: 403;
  error: 'Forbidden';
  audit: {
    action: 'document.forbidden';
    entityType: 'claim_document';
    entityId: string;
    metadata: Record<string, unknown>;
  };
};

type NotFoundResult = {
  ok: false;
  status: 404;
  error: 'Document not found';
};

type OkResult = {
  ok: true;
  document: DocumentRow;
  audit: {
    action: 'document.signed_url_issued' | 'document.view' | 'document.download';
    entityType: 'claim_document';
    entityId: string;
    actorRole: string | null;
    metadata: Record<string, unknown>;
  };
};

type DocumentAccessResult = ForbiddenResult | NotFoundResult | OkResult;

export function safeFilename(value: string) {
  // Keep it simple; rely on filename* encoding for non-ascii.
  return value.replace(/[\r\n"]/g, '_');
}

export async function getDocumentAccessCore(args: {
  session: Session;
  documentId: string;
  mode: DocumentAccessMode;
  disposition?: 'inline' | 'attachment';
}): Promise<DocumentAccessResult> {
  const { session, documentId, mode, disposition } = args;

  // Fetch document metadata + claim ownership for RBAC
  const [row] = await db
    .select({
      doc: claimDocuments,
      claimOwnerId: claims.userId,
    })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(eq(claimDocuments.id, documentId));

  if (!row?.doc) {
    return { ok: false, status: 404, error: 'Document not found' };
  }

  const doc = row.doc as unknown as DocumentRow;

  const userRole = (session.user.role as string | undefined) ?? undefined;
  const isPrivileged = userRole === 'admin' || userRole === 'staff';
  const isClaimOwner = row.claimOwnerId === session.user.id;
  const isUploader = doc.uploadedBy === session.user.id;

  // Allow staff/admin access, or the member who owns the claim, or the uploader.
  // (Uploader check is retained for backward compatibility with any legacy flows.)
  if (!isPrivileged && !isClaimOwner && !isUploader) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden',
      audit: {
        action: 'document.forbidden',
        entityType: 'claim_document',
        entityId: documentId,
        metadata: {
          claimId: doc.claimId,
          bucket: doc.bucket,
          filePath: doc.filePath,
          ...(mode === 'signed_url'
            ? { mode: 'signed_url' }
            : { disposition: disposition ?? 'attachment' }),
        },
      },
    };
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

  const finalDisposition: 'inline' | 'attachment' =
    disposition === 'inline' ? 'inline' : 'attachment';

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
}): Promise<{ ok: true; signedUrl: string } | { ok: false }> {
  const { bucket, filePath, expiresInSeconds } = args;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data?.signedUrl) return { ok: false };
  return { ok: true, signedUrl: data.signedUrl };
}

export async function downloadStorageFileCore(args: {
  bucket: string;
  filePath: string;
}): Promise<{ ok: true; data: Blob } | { ok: false }> {
  const { bucket, filePath } = args;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage.from(bucket).download(filePath);

  if (error || !data) return { ok: false };
  return { ok: true, data };
}
