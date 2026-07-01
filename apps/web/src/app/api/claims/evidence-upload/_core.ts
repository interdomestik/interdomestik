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
  findOwnedMemberUploadClaim,
} from '@/features/claims/upload/server/access';
import { LOCALES } from '@/i18n/locales';
import { auth } from '@/lib/auth';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { uploadTenantObject } from '@/lib/storage/service-role';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { ensureTenantId } from '@interdomestik/shared-auth';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'node:crypto';

import { confirmEvidenceUpload } from './confirm';

const ADMIN_UPLOAD_ROLES = new Set([
  'admin',
  'super_admin',
  'tenant_admin',
  'branch_manager',
  'staff',
]);
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

type UploadCategory = 'evidence' | 'legal';
type EvidenceUploadForm = {
  aiExtractionConsentGranted: boolean;
  category: UploadCategory;
  claimId: string;
  file: File;
  locale: string;
};

type ResponseResult<T> = { success: true; data: T } | { success: false; response: Response };
type ClaimAccess =
  | { success: true; isAdminSurface: boolean }
  | { success: false; status: 401 | 404 };

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function isAdminUploadRole(role: string | null | undefined): boolean {
  return role ? ADMIN_UPLOAD_ROLES.has(role) : false;
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

async function parseEvidenceUploadForm(
  request: Request
): Promise<ResponseResult<EvidenceUploadForm>> {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return { success: false, response: jsonError('Invalid form payload', 400) };
  }

  const claimId = formData.get('claimId');
  const category = formData.get('category');
  const locale = formData.get('locale');
  const aiExtractionConsentGranted = formData.get('aiExtractionConsentGranted');
  const file = formData.get('file');

  if (
    typeof claimId !== 'string' ||
    (category !== 'evidence' && category !== 'legal') ||
    typeof locale !== 'string' ||
    !LOCALES.includes(locale as (typeof LOCALES)[number]) ||
    !(file instanceof File)
  ) {
    return { success: false, response: jsonError('Invalid form payload', 400) };
  }

  if (file.size <= 0) {
    return { success: false, response: jsonError('Invalid form payload', 400) };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { success: false, response: jsonError('File too large (max 50MB)', 413) };
  }

  return {
    success: true,
    data: {
      aiExtractionConsentGranted: aiExtractionConsentGranted === 'true',
      category,
      claimId,
      file,
      locale,
    },
  };
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

  const { aiExtractionConsentGranted, category, claimId, file, locale } = form.data;
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
