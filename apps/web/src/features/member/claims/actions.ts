'use server';

import { auth } from '@/lib/auth';
import {
  createSignedUploadUrl,
  persistClaimDocumentAndQueueWorkflows,
  revalidatePathForAllLocales,
  validateConfirmedClaimUpload,
} from '@/features/claims/upload/server/shared-upload';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { claims, db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export type GenerateUploadUrlResult =
  | {
      success: true;
      url: string;
      path: string;
      id: string;
      token: string;
      bucket: string;
      intentToken: string;
    }
  | { success: false; error: string; status: 400 | 401 | 404 | 413 | 500 };

export async function generateUploadUrl(
  claimId: string,
  fileName: string,
  contentType: string,
  fileSize: number
): Promise<GenerateUploadUrlResult> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized', status: 401 };
  }

  const tenantId = ensureTenantId(session);
  let evidenceBucket: string;
  try {
    evidenceBucket = resolveEvidenceBucketName();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[member/claims] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, error: message, status: 500 };
  }

  // Authorization: fail-closed to claims owned by the current member and tenant.
  const claim = await db.query.claims.findFirst({
    where: and(
      eq(claims.id, claimId),
      eq(claims.tenantId, tenantId),
      eq(claims.userId, session.user.id)
    ),
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  return createSignedUploadUrl({
    actorId: session.user.id,
    bucket: evidenceBucket,
    claimId,
    fileName,
    fileSize,
    logPrefix: '[member/claims]',
    mimeType: contentType,
    tenantId,
  });
}

export type ConfirmUploadResult =
  | { success: true }
  | { success: false; error: string; status: 401 | 404 | 409 | 500 };

export type ConfirmUploadParams = {
  claimId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileId: string;
  uploadIntentToken: string;
  storageContentType?: string;
  uploadedBucket?: string;
  category?: 'evidence' | 'legal';
};

type ConfirmUploadContext =
  | {
      success: true;
      session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
      tenantId: string;
      resolvedBucket: string;
    }
  | { success: false; error: string; status: 401 | 500 };

async function resolveConfirmUploadContext(): Promise<ConfirmUploadContext> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { success: false, error: 'Unauthorized', status: 401 };
  }

  try {
    return {
      success: true,
      session,
      tenantId: ensureTenantId(session),
      resolvedBucket: resolveEvidenceBucketName(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload bucket configuration error';
    console.error('[member/claims] Bucket configuration error', {
      message,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    });
    return { success: false, error: message, status: 500 };
  }
}

export async function confirmUpload(params: ConfirmUploadParams): Promise<ConfirmUploadResult> {
  const {
    claimId,
    storagePath,
    originalName,
    mimeType,
    fileSize,
    fileId,
    uploadedBucket,
    category = 'evidence',
  } = params;
  const uploadContext = await resolveConfirmUploadContext();
  if (!uploadContext.success) {
    return uploadContext;
  }
  const { session, tenantId, resolvedBucket } = uploadContext;

  // Authorization: fail-closed to claims owned by the current member and tenant.
  const claim = await db.query.claims.findFirst({
    where: and(
      eq(claims.id, claimId),
      eq(claims.tenantId, tenantId),
      eq(claims.userId, session.user.id)
    ),
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', status: 404 };
  }

  try {
    if (uploadedBucket && uploadedBucket !== resolvedBucket) {
      console.error('[member/claims] confirmUpload bucket mismatch', {
        uploadedBucket,
        resolvedBucket,
      });
      return {
        success: false,
        error: 'Upload bucket mismatch detected. Please retry upload.',
        status: 409,
      };
    }

    const validatedUpload = await validateConfirmedClaimUpload({
      actorId: session.user.id,
      bucket: resolvedBucket,
      confirmation: params,
      logPrefix: '[member/claims] confirmUpload',
      tenantId,
    });

    if (!validatedUpload.success) {
      return validatedUpload;
    }

    await persistClaimDocumentAndQueueWorkflows({
      category,
      claimId,
      fileId,
      fileSize,
      logPrefix: '[member/claims] confirmUpload',
      mimeType,
      originalName,
      resolvedBucket,
      storagePath,
      tenantId,
      userId: session.user.id,
    });

    revalidatePathForAllLocales(`/member/claims/${claimId}`);
    revalidatePathForAllLocales('/member/documents');
    return { success: true };
  } catch (err) {
    console.error('confirmUpload error:', err);
    return { success: false, error: 'Failed to save document metadata', status: 500 };
  }
}
