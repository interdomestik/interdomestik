import { and, claims, createAdminClient, db, eq } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { z } from 'zod';

type Session = {
  user: {
    id: string;
    role?: string | null;
    tenantId?: string | null;
  };
};

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const DEFAULT_BUCKET = 'claim-evidence';
export const DEFAULT_CLASSIFICATION = 'pii' as const;

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().positive(),
  claimId: z.string().optional(),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const sanitizeFileName = (fileName: string) => fileName.replace(/[^\w.-]+/g, '_');

type UploadOk = {
  ok: true;
  status: 200;
  body: {
    upload: {
      path: string;
      token: string;
      signedUrl: string;
      bucket: string;
      expiresIn: number;
    };
    classification: string;
    maxFileSize: number;
    allowedMimeTypes: readonly string[];
  };
};

type UploadErr = {
  ok: false;
  status: 403 | 404 | 413 | 415 | 500;
  error:
    | 'Forbidden'
    | 'Claim not found'
    | 'File too large'
    | 'File type not allowed'
    | 'Failed to create signed upload URL';
};

export type UploadResult = UploadOk | UploadErr;

export async function createSignedUploadCore(args: {
  session: Session;
  input: UploadRequest;
  bucket: string;
}): Promise<UploadResult> {
  const { session, input, bucket } = args;

  const { fileName, fileType, fileSize, claimId } = input;

  if (!ALLOWED_MIME_TYPES.includes(fileType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { ok: false, status: 415, error: 'File type not allowed' };
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    return { ok: false, status: 413, error: 'File too large' };
  }

  const tenantId = ensureTenantId(session);

  if (claimId) {
    const claim = await db.query.claims.findFirst({
      where: and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)),
      columns: {
        id: true,
        userId: true,
      },
    });

    if (!claim) {
      return { ok: false, status: 404, error: 'Claim not found' };
    }

    if (claim.userId !== session.user.id) {
      return { ok: false, status: 403, error: 'Forbidden' };
    }
  }

  const evidenceId = nanoid();
  const safeName = sanitizeFileName(fileName);
  const classification = DEFAULT_CLASSIFICATION;
  const path = `${classification}/tenants/${tenantId}/claims/${session.user.id}/${claimId ?? 'unassigned'}/${evidenceId}-${safeName}`;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage.from(bucket).createSignedUploadUrl(path, {
    upsert: true,
  });

  if (error || !data) {
    return { ok: false, status: 500, error: 'Failed to create signed upload URL' };
  }

  return {
    ok: true,
    status: 200,
    body: {
      upload: {
        path,
        token: data.token,
        signedUrl: data.signedUrl,
        bucket,
        expiresIn: 300,
      },
      classification,
      maxFileSize: MAX_FILE_SIZE_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    },
  };
}
