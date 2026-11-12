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
import { isMemberUploadRole } from '@/features/claims/upload/server/member-upload-role';
import { createInitialClaimUploadIntentToken } from '@/features/claims/upload/server/initial-claim-upload';
import {
  EVIDENCE_FORMATS,
  validateEvidenceFile,
} from '@/features/claims/upload/evidence-file-policy';
import { createEvidenceUploadPath } from './evidence-upload-path';
import type { UploadErr, UploadResult } from './upload-result';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type SessionUser = {
  id: string;
  accessTenantId?: string | null;
  role?: string | null;
  tenantId?: string | null;
};
type Session = { user: SessionUser };
export const ALLOWED_MIME_TYPES = EVIDENCE_FORMATS.map(format => format.mimeType);
export const MAX_FILE_SIZE_BYTES = EVIDENCE_FORMATS[0].maxBytes;
export const DEFAULT_BUCKET = DEFAULT_EVIDENCE_BUCKET;
export const DEFAULT_CLASSIFICATION = 'pii' as const;

export type { UploadResult } from './upload-result';

const FORBIDDEN: UploadErr = { ok: false, status: 403, error: 'Forbidden' };

export const uploadRequestSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string(),
  fileSize: z.number().positive(),
  claimId: z.string().optional(),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

type InitialUploadIntentResult =
  { ok: true; intentToken: string } | { ok: false; result: UploadErr };

export async function createSignedUploadCore(args: {
  session: Session;
  authority: TenantAuthority;
  input: UploadRequest;
  bucket: string;
}): Promise<UploadResult> {
  const { session, authority, input, bucket } = args;

  const { fileName, fileType, fileSize, claimId } = input;

  const validation = validateEvidenceFile(fileName, fileSize, fileType);
  if (!validation.success) {
    if (validation.error === 'evidence_too_large')
      return { ok: false, status: 413, error: 'evidence_too_large' };
    return { ok: false, status: 415, error: validation.error };
  }
  const mimeType = validation.format.mimeType;

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
      if (!isMemberUploadRole(role)) return { claim, allowed: false };
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
  } else if (!isMemberUploadRole(role)) {
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
      fileType: mimeType,
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
    upsert: false,
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
        mimeType,
        storageContentType: mimeType,
        ...(intentToken ? { intentToken } : {}),
      },
      classification,
      maxFileSize: validation.format.maxBytes,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
    },
  };
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
