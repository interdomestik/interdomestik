import { and, claims, createAdminClient, db, eq } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { DEFAULT_EVIDENCE_BUCKET } from '@/lib/storage/evidence-bucket';
import { createInitialClaimUploadIntentToken } from '@/features/claims/upload/server/initial-claim-upload';
import {
  assertEvidenceStoragePath,
  buildEvidenceStoragePath,
} from '@/features/claims/upload/server/storage-path';

type Session = {
  user: {
    id: string;
    role?: string | null;
    tenantId?: string | null;
  };
};

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'text/plain',
] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const DEFAULT_BUCKET = DEFAULT_EVIDENCE_BUCKET;
export const DEFAULT_CLASSIFICATION = 'pii' as const;

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().positive(),
  claimId: z.string().optional(),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

type UploadOk = {
  ok: true;
  status: 200;
  body: {
    upload: {
      id: string;
      path: string;
      token: string;
      signedUrl: string;
      bucket: string;
      expiresIn: number;
      intentToken?: string;
    };
    classification: string;
    maxFileSize: number;
    allowedMimeTypes: readonly string[];
  };
};

type UploadErr = {
  ok: false;
  status: 400 | 403 | 404 | 413 | 415 | 500;
  error:
    | 'Invalid file name'
    | 'Forbidden'
    | 'Claim not found'
    | 'File too large'
    | 'File type not allowed'
    | 'Failed to create signed upload URL';
};

export type UploadResult = UploadOk | UploadErr;

type InitialUploadIntentResult =
  | { ok: true; intentToken: string }
  | { ok: false; result: UploadErr };

type EvidenceUploadPathResult = { ok: true; path: string } | { ok: false; result: UploadErr };

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
        agentId: true,
      },
    });

    if (!claim) {
      return { ok: false, status: 404, error: 'Claim not found' };
    }

    const role = session.user.role;

    const canUpload =
      claim.userId === session.user.id || (role === 'agent' && claim.agentId === session.user.id);

    if (!canUpload) {
      return { ok: false, status: 403, error: 'Forbidden' };
    }
  }

  const evidenceId = nanoid();
  const classification = DEFAULT_CLASSIFICATION;
  const pathResult = createEvidenceUploadPath({
    actorId: session.user.id,
    bucket,
    claimId,
    evidenceId,
    fileName,
    tenantId,
  });

  if (!pathResult.ok) return pathResult.result;
  const path = pathResult.path;

  let intentToken: string | undefined;
  if (!claimId) {
    const intent = createUnassignedUploadIntentToken({
      actorId: session.user.id,
      bucket,
      fileId: evidenceId,
      fileSize,
      fileType,
      path,
      tenantId,
    });
    if (!intent.ok) {
      return intent.result;
    }
    intentToken = intent.intentToken;
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage.from(bucket).createSignedUploadUrl(path, {
    upsert: true,
  });

  if (error || !data) {
    console.error('[api/uploads] Signed upload URL creation failed', {
      bucket,
      path,
      fileType,
      fileSize,
      claimId: claimId ?? null,
      error: error?.message ?? 'unknown',
    });
    return { ok: false, status: 500, error: 'Failed to create signed upload URL' };
  }

  return {
    ok: true,
    status: 200,
    body: {
      upload: {
        id: evidenceId,
        path,
        token: data.token,
        signedUrl: data.signedUrl,
        bucket,
        expiresIn: 300,
        ...(intentToken ? { intentToken } : {}),
      },
      classification,
      maxFileSize: MAX_FILE_SIZE_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    },
  };
}

function createEvidenceUploadPath(args: {
  actorId: string;
  bucket: string;
  claimId?: string;
  evidenceId: string;
  fileName: string;
  tenantId: string;
}): EvidenceUploadPathResult {
  const { actorId, bucket, claimId, evidenceId, fileName, tenantId } = args;

  try {
    return claimId
      ? createAssignedEvidenceUploadPath({ bucket, claimId, evidenceId, fileName, tenantId })
      : createInitialEvidenceUploadPath({ actorId, bucket, evidenceId, fileName, tenantId });
  } catch {
    return { ok: false, result: { ok: false, status: 400, error: 'Invalid file name' } };
  }
}

function createAssignedEvidenceUploadPath(args: {
  bucket: string;
  claimId: string;
  evidenceId: string;
  fileName: string;
  tenantId: string;
}): { ok: true; path: string } {
  const { bucket, claimId, evidenceId, fileName, tenantId } = args;
  const path = buildEvidenceStoragePath({
    bucket,
    claimId,
    fileId: evidenceId,
    fileName,
    shape: 'assigned',
    tenantId,
  });

  assertEvidenceStoragePath({
    bucket,
    claimId,
    fileId: evidenceId,
    shape: 'assigned',
    storagePath: path,
    tenantId,
  });

  return { ok: true, path };
}

function createInitialEvidenceUploadPath(args: {
  actorId: string;
  bucket: string;
  evidenceId: string;
  fileName: string;
  tenantId: string;
}): { ok: true; path: string } {
  const { actorId, bucket, evidenceId, fileName, tenantId } = args;
  const path = buildEvidenceStoragePath({
    actorId,
    bucket,
    fileId: evidenceId,
    fileName,
    shape: 'initial',
    tenantId,
  });

  assertEvidenceStoragePath({
    actorId,
    bucket,
    fileId: evidenceId,
    shape: 'initial',
    storagePath: path,
    tenantId,
  });

  return { ok: true, path };
}

function createUnassignedUploadIntentToken(args: {
  actorId: string;
  bucket: string;
  fileId: string;
  fileSize: number;
  fileType: string;
  path: string;
  tenantId: string;
}): InitialUploadIntentResult {
  const { actorId, bucket, fileId, fileSize, fileType, path, tenantId } = args;

  try {
    return {
      ok: true,
      intentToken: createInitialClaimUploadIntentToken({
        actorId,
        bucket,
        fileId,
        fileSize,
        mimeType: fileType,
        storagePath: path,
        tenantId,
      }),
    };
  } catch (error) {
    console.error('[api/uploads] Upload intent creation failed', {
      bucket,
      path,
      fileType,
      fileSize,
      claimId: null,
      error: error instanceof Error ? error.message : 'unknown',
    });

    return {
      ok: false,
      result: { ok: false, status: 500, error: 'Failed to create signed upload URL' },
    };
  }
}
