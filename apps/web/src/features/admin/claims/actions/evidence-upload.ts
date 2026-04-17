'use server';

import { findAccessibleAdminUploadClaim } from '@/features/claims/upload/server/access';
import {
  createSignedUploadUrl,
  persistClaimDocumentAndQueueWorkflows,
  revalidatePathForAllLocales,
} from '@/features/claims/upload/server/shared-upload';
import { auth } from '@/lib/auth';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { resolveTenantFromHost } from '@/lib/tenant/tenant-hosts';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';
const ALLOWED_ADMIN_UPLOAD_ROLES = new Set([
  'admin',
  'super_admin',
  'tenant_admin',
  'branch_manager',
  'staff',
]);

function isAdminUploadRole(role: string | null | undefined): boolean {
  return role ? ALLOWED_ADMIN_UPLOAD_ROLES.has(role) : false;
}

type UploadContext =
  | {
      success: true;
      session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
      tenantId: string;
      resolvedBucket: string;
    }
  | { success: false; error: string; status: 401 | 500 };

export type GenerateAdminUploadUrlResult =
  | { success: true; url: string; path: string; id: string; token: string; bucket: string }
  | { success: false; error: string; status: 401 | 404 | 413 | 500 };

export type ConfirmAdminUploadResult =
  | { success: true }
  | { success: false; error: string; status: 401 | 404 | 409 | 500 };

export type ConfirmAdminUploadParams = {
  claimId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileId: string;
  uploadedBucket?: string;
  category?: 'evidence' | 'legal';
};

async function resolveAdminUploadContext(): Promise<UploadContext> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (!session || !isAdminUploadRole(session.user.role)) {
    return { success: false, error: 'Unauthorized', status: 401 };
  }

  try {
    const tenantId = ensureTenantId(session);
    const requestHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? '';
    const hostTenantId = resolveTenantFromHost(requestHost);

    if (!hostTenantId || hostTenantId !== tenantId) {
      return { success: false, error: 'Unauthorized', status: 401 };
    }

    return {
      success: true,
      session,
      tenantId,
      resolvedBucket: resolveEvidenceBucketName(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[admin/claims] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, error: message, status: 500 };
  }
}

function revalidateAdminEvidencePaths(claimId: string) {
  revalidatePathForAllLocales('/admin/claims');
  revalidatePathForAllLocales(`/admin/claims/${claimId}`);
  revalidatePathForAllLocales(`/staff/claims/${claimId}`);
  revalidatePathForAllLocales(`/member/claims/${claimId}`);
  revalidatePathForAllLocales('/member/documents');
}

export async function generateAdminUploadUrl(
  claimId: string,
  fileName: string,
  _contentType: string,
  fileSize: number
): Promise<GenerateAdminUploadUrlResult> {
  const uploadContext = await resolveAdminUploadContext();
  if (!uploadContext.success) {
    return uploadContext;
  }

  const { tenantId, resolvedBucket } = uploadContext;
  const claim = await findAccessibleAdminUploadClaim({
    branchId: uploadContext.session.user.branchId ?? null,
    claimId,
    role: uploadContext.session.user.role ?? null,
    tenantId,
    userId: uploadContext.session.user.id,
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  return createSignedUploadUrl({
    bucket: resolvedBucket,
    claimId,
    fileName,
    fileSize,
    logPrefix: '[admin/claims]',
    tenantId,
  });
}

export async function confirmAdminUpload({
  claimId,
  storagePath,
  originalName,
  mimeType,
  fileSize,
  fileId,
  uploadedBucket,
  category = 'evidence',
}: ConfirmAdminUploadParams): Promise<ConfirmAdminUploadResult> {
  const uploadContext = await resolveAdminUploadContext();
  if (!uploadContext.success) {
    return uploadContext;
  }

  const { session, tenantId, resolvedBucket } = uploadContext;
  const claim = await findAccessibleAdminUploadClaim({
    branchId: session.user.branchId ?? null,
    claimId,
    role: session.user.role ?? null,
    tenantId,
    userId: session.user.id,
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  try {
    if (uploadedBucket && uploadedBucket !== resolvedBucket) {
      return {
        success: false,
        error: 'Upload bucket mismatch detected. Please retry upload.',
        status: 409,
      };
    }

    await persistClaimDocumentAndQueueWorkflows({
      category,
      claimId,
      fileId,
      fileSize,
      logPrefix: '[admin/claims] confirmAdminUpload',
      mimeType,
      originalName,
      resolvedBucket,
      storagePath,
      tenantId,
      userId: session.user.id,
    });

    revalidateAdminEvidencePaths(claimId);
    return { success: true };
  } catch (error) {
    console.error('[admin/claims] confirmAdminUpload error', error);
    return { success: false, error: 'Failed to save document metadata', status: 500 };
  }
}
