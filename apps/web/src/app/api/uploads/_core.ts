import { and, claims, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { hasAgentClaimDocumentScope } from '@/app/api/documents/agent-document-scope';
import { matchesAccessTenant } from '@/lib/db/access-tenant-predicate';
import { DEFAULT_EVIDENCE_BUCKET } from '@/lib/storage/evidence-bucket';
import { createInitialClaimUploadIntentToken } from '@/features/claims/upload/server/initial-claim-upload';
import type { UploadErr, UploadResult } from './upload-result';
import {
  assertEvidenceStoragePath,
  buildEvidenceStoragePath,
} from '@/features/claims/upload/server/storage-path';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type SessionUser = {
  id: string;
  accessTenantId?: string | null;
  role?: string | null;
  tenantId?: string | null;
};
type Session = { user: SessionUser };
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'text/plain',
] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const DEFAULT_BUCKET = DEFAULT_EVIDENCE_BUCKET;
export const DEFAULT_CLASSIFICATION = 'pii' as const;

export type { UploadResult } from './upload-result';

/**
 * Claim evidence is uploaded here only by member-portal actors (agents act as members): staff and
 * administrators use their own evidence action, and read-only roles receive no write capability.
 */
const MEMBER_UPLOAD_ROLES: ReadonlySet<string> = new Set(['member', 'user', 'agent']);
const FORBIDDEN: UploadErr = { ok: false, status: 403, error: 'Forbidden' };

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().positive(),
  claimId: z.string().optional(),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

type InitialUploadIntentResult =
  { ok: true; intentToken: string } | { ok: false; result: UploadErr };

type EvidenceUploadPathResult = { ok: true; path: string } | { ok: false; result: UploadErr };

export async function createSignedUploadCore(args: {
  session: Session;
  authority: TenantAuthority;
  input: UploadRequest;
  bucket: string;
}): Promise<UploadResult> {
  const { session, authority, input, bucket } = args;

  const { fileName, fileType, fileSize, claimId } = input;

  if (!ALLOWED_MIME_TYPES.includes(fileType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { ok: false, status: 415, error: 'File type not allowed' };
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) return { ok: false, status: 413, error: 'File too large' };

  const { tenantId } = readTenantAuthority(authority);
  const role = session.user.role ?? '';
  let storageTenantId = tenantId;
  if (claimId) {
    const access = await withTenantAuthority(authority, async tx => {
      const claim = await tx.query.claims.findFirst({
        where: and(eq(claims.id, claimId), matchesAccessTenant(claims, tenantId)),
        columns: { id: true, tenantId: true, userId: true, agentId: true, branchId: true },
      });
      if (!claim) return null;
      if (!MEMBER_UPLOAD_ROLES.has(role)) return { claim, allowed: false };
      if (claim.userId === session.user.id) return { claim, allowed: true };
      // An agent uploads to an attributed claim only within its active client and branch scope.
      const allowed =
        role === 'agent' &&
        (await hasAgentClaimDocumentScope({
          agentId: session.user.id,
          claim: { agentId: claim.agentId, branchId: claim.branchId, ownerId: claim.userId },
          db: tx,
          tenantId,
        }));
      return { claim, allowed };
    });

    if (!access) return { ok: false, status: 404, error: 'Claim not found' };
    if (!access.allowed) return FORBIDDEN;
    storageTenantId = access.claim.tenantId;
  } else if (!MEMBER_UPLOAD_ROLES.has(role)) {
    return FORBIDDEN;
  }

  const generatedEvidenceId = nanoid();
  const evidenceId = /^[A-Za-z0-9]/.test(generatedEvidenceId)
    ? generatedEvidenceId
    : `e${generatedEvidenceId}`;
  const classification = DEFAULT_CLASSIFICATION;
  const pathResult = createEvidenceUploadPath({
    actorId: session.user.id,
    bucket,
    claimId,
    evidenceId,
    fileName,
    tenantId: storageTenantId,
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
      tenantId: storageTenantId,
    });
    if (!intent.ok) {
      return intent.result;
    }
    intentToken = intent.intentToken;
  }

  const { createTenantSignedUploadUrl } = await import('@/lib/storage/service-role');
  const { data, error } = await createTenantSignedUploadUrl({
    bucket,
    context: 'initial claim evidence upload',
    family: 'claims',
    path,
    tenantId: storageTenantId,
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
