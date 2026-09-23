import {
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from '@/features/admin/claims/components/ops/file-upload-meta';
import { createClaimUploadIntentToken } from '@/features/claims/upload/server/shared-upload';
import {
  assertEvidenceStoragePath,
  buildEvidenceStoragePath,
} from '@/features/claims/upload/server/storage-path';
import {
  findAccessibleAdminUploadClaim,
  findOwnedMemberInformationRequest,
  findOwnedMemberUploadClaim,
} from '@/features/claims/upload/server/access';
import { auth } from '@/lib/auth';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { uploadTenantObject } from '@/lib/storage/service-role';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { ensureTenantId } from '@interdomestik/shared-auth';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'node:crypto';

import { confirmEvidenceUpload } from './confirm';
import { isAdminUploadRole } from './admin-upload-role';
import { parseEvidenceUploadForm, type UploadCategory } from './parse-evidence-upload-form';

type ResponseResult<T> = { success: true; data: T } | { success: false; response: Response };
type ClaimAccess =
  { success: true; isAdminSurface: boolean } | { success: false; status: 401 | 404 };

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

async function validateClaimAccess(params: {
  branchId?: string | null;
  claimId: string;
  role: string | null | undefined;
  tenantId: string;
  host: string;
  userId: string;
}): Promise<ClaimAccess> {
  const { claimId, role, tenantId, host, userId } = params;
  const isAdminSurface = isAdminUploadRole(role) && resolveTenantFromHost(host) === tenantId;

  if (isAdminSurface) {
    const claim = await findAccessibleAdminUploadClaim({
      branchId: params.branchId ?? null,
      claimId,
      role,
      tenantId,
      userId,
    });

    return claim ? { success: true, isAdminSurface } : { success: false, status: 404 };
  }

  const claim = await findOwnedMemberUploadClaim({
    claimId,
    tenantId,
    userId,
  });

  if (!claim) {
    return { success: false, status: 404 };
  }

  return { success: true, isAdminSurface };
}

function resolveTenantId(
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>
): ResponseResult<string> {
  try {
    return { success: true, data: ensureTenantId(session) };
  } catch {
    return { success: false, response: jsonError('Unauthorized', 401) };
  }
}

function resolveEvidenceBucket(): ResponseResult<string> {
  try {
    return { success: true, data: resolveEvidenceBucketName() };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Invalid storage configuration for tenant evidence bucket';
    return { success: false, response: jsonError(message, 500) };
  }
}

function createUploadIntent(params: {
  bucket: string;
  claimId: string;
  file: File;
  fileId: string;
  resolvedMimeType: string;
  storageContentType: string;
  storagePath: string;
  informationRequestId?: string;
  tenantId: string;
  userId: string;
}): ResponseResult<string> {
  try {
    return {
      success: true,
      data: createClaimUploadIntentToken({
        actorId: params.userId,
        bucket: params.bucket,
        claimId: params.claimId,
        fileId: params.fileId,
        fileSize: params.file.size,
        informationRequestId: params.informationRequestId,
        mimeType: params.resolvedMimeType,
        storageContentType: params.storageContentType,
        storagePath: params.storagePath,
        tenantId: params.tenantId,
      }),
    };
  } catch (error) {
    console.error('[claims/evidence-upload] Upload intent configuration error', {
      message: error instanceof Error ? error.message : 'Upload intent configuration error',
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, response: jsonError('Upload configuration error', 500) };
  }
}

async function uploadEvidenceObject(params: {
  bucket: string;
  file: File;
  storageContentType: string;
  storagePath: string;
  tenantId: string;
}): Promise<Response | null> {
  const buffer = Buffer.from(await params.file.arrayBuffer());

  const { error: uploadError } = await uploadTenantObject({
    bucket: params.bucket,
    body: buffer,
    contentType: params.storageContentType,
    context: 'claim evidence direct upload',
    family: 'claims',
    path: params.storagePath,
    tenantId: params.tenantId,
    upsert: true,
  });

  if (uploadError) {
    return jsonError(uploadError.message || 'Failed to upload evidence', 500);
  }

  return null;
}

function captureConfirmFailure(params: {
  bucket: string;
  category: UploadCategory;
  claimId: string;
  confirmError: string;
  confirmStatus: number;
  fileId: string;
  role: string | null;
  storagePath: string;
  tenantId: string;
  userId: string;
}) {
  Sentry.captureMessage('claim.evidence_upload.confirm_failed_after_storage_upload', {
    level: 'warning',
    extra: params,
  });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return jsonError('Unauthorized', 401);
  }

  const form = await parseEvidenceUploadForm(request);
  if (!form.success) return form.response;

  const tenant = resolveTenantId(session);
  if (!tenant.success) return tenant.response;

  const evidenceBucket = resolveEvidenceBucket();
  if (!evidenceBucket.success) return evidenceBucket.response;

  const { aiExtractionConsentGranted, category, claimId, file, informationRequestId, locale } =
    form.data;
  const tenantId = tenant.data;
  const bucket = evidenceBucket.data;
  const role = session.user.role ?? null;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const claimAccess = await validateClaimAccess({
    branchId: session.user.branchId ?? null,
    claimId,
    role,
    tenantId,
    host,
    userId: session.user.id,
  });

  if (!claimAccess.success) {
    return jsonError(
      claimAccess.status === 404 ? 'Claim not found' : 'Unauthorized',
      claimAccess.status
    );
  }

  if (informationRequestId && claimAccess.isAdminSurface) {
    return jsonError('Information request not found', 404);
  }

  if (
    informationRequestId &&
    !(await findOwnedMemberInformationRequest({
      claimId,
      informationRequestId,
      tenantId,
      userId: session.user.id,
    }))
  ) {
    return jsonError('Information request not found', 404);
  }

  const resolvedMimeType = resolveUploadMimeType(file);
  const storageContentType = resolveStorageUploadContentType(file);
  const fileId = randomUUID();
  let storagePath: string;

  try {
    storagePath = buildEvidenceStoragePath({
      bucket,
      claimId,
      fileId,
      fileName: file.name,
      shape: 'assigned',
      tenantId,
    });
    assertEvidenceStoragePath({
      bucket,
      claimId,
      fileId,
      shape: 'assigned',
      storagePath,
      tenantId,
    });
  } catch {
    return jsonError('Invalid form payload', 400);
  }

  const uploadIntent = createUploadIntent({
    bucket,
    claimId,
    file,
    fileId,
    informationRequestId,
    resolvedMimeType,
    storageContentType,
    storagePath,
    tenantId,
    userId: session.user.id,
  });

  if (!uploadIntent.success) return uploadIntent.response;

  const uploadError = await uploadEvidenceObject({
    bucket,
    file,
    storageContentType,
    storagePath,
    tenantId,
  });
  if (uploadError) return uploadError;

  const confirmResult = await confirmEvidenceUpload({
    aiExtractionConsentGranted,
    bucket,
    category,
    claimId,
    file,
    fileId,
    informationRequestId,
    isAdminSurface: claimAccess.isAdminSurface,
    locale,
    resolvedMimeType,
    storageContentType,
    storagePath,
    uploadIntentToken: uploadIntent.data,
  });

  if (!confirmResult.success) {
    captureConfirmFailure({
      bucket,
      category,
      claimId,
      confirmError: confirmResult.error,
      confirmStatus: confirmResult.status,
      fileId,
      role,
      storagePath,
      tenantId,
      userId: session.user.id,
    });
    return jsonError(confirmResult.error, confirmResult.status);
  }

  return Response.json({ success: true, fileId, storagePath });
}
