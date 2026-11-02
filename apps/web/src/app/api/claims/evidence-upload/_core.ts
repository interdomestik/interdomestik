import {
  resolveStorageUploadContentType,
  resolveUploadMimeType,
} from '@/features/admin/claims/components/ops/file-upload-meta';

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

import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import * as Sentry from '@sentry/nextjs';
import { randomUUID } from 'node:crypto';

import { confirmEvidenceUpload } from './confirm';
import { isAdminUploadRole } from './admin-upload-role';
import { parseEvidenceUploadForm, type UploadCategory } from './parse-evidence-upload-form';
import { jsonError, createUploadIntent, uploadEvidenceObject } from './_upload';

export type ResponseResult<T> = { success: true; data: T } | { success: false; response: Response };
type ClaimAccess =
  { success: true; isAdminSurface: boolean } | { success: false; status: 401 | 404 };

async function validateClaimAccess(params: {
  branchId?: string | null;
  claimId: string;
  role: string | null | undefined;
  authority: TenantAuthority;
  tenantId: string;
  host: string;
  userId: string;
}): Promise<ClaimAccess> {
  const { claimId, role, authority, tenantId, host, userId } = params;
  const isAdminSurface = isAdminUploadRole(role) && resolveTenantFromHost(host) === tenantId;

  if (isAdminSurface) {
    const claim = await findAccessibleAdminUploadClaim({
      branchId: params.branchId ?? null,
      claimId,
      role,
      authority,
      userId,
    });

    return claim ? { success: true, isAdminSurface } : { success: false, status: 404 };
  }

  const claim = await findOwnedMemberUploadClaim({
    claimId,
    authority,
    userId,
  });

  if (!claim) {
    return { success: false, status: 404 };
  }

  return { success: true, isAdminSurface };
}

async function resolveTenantAuthority(
  requestHeaders: Headers
): Promise<ResponseResult<{ authority: TenantAuthority; tenantId: string }>> {
  try {
    const authorized = await authorizeSessionTenant(requestHeaders);
    if (!authorized) return { success: false, response: jsonError('Unauthorized', 401) };
    return {
      success: true,
      data: {
        authority: authorized.authority,
        tenantId: readTenantAuthority(authorized.authority).tenantId,
      },
    };
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

  const tenant = await resolveTenantAuthority(request.headers);
  if (!tenant.success) return tenant.response;

  const evidenceBucket = resolveEvidenceBucket();
  if (!evidenceBucket.success) return evidenceBucket.response;

  const { aiExtractionConsentGranted, category, claimId, file, informationRequestId, locale } =
    form.data;
  const { authority, tenantId } = tenant.data;
  const bucket = evidenceBucket.data;
  const role = session.user.role ?? null;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const claimAccess = await validateClaimAccess({
    branchId: session.user.branchId ?? null,
    claimId,
    role,
    authority,
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
      authority,
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
