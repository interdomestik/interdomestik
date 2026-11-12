import { createClaimUploadIntentToken } from '@/features/claims/upload/server/shared-upload';
import { uploadTenantObject } from '@/lib/storage/service-role';
import type { ResponseResult } from './_core';

export function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export function createUploadIntent(params: {
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

export async function uploadEvidenceObject(params: {
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
    upsert: false,
  });

  if (uploadError) {
    return jsonError('evidence_upload_failed', 500);
  }

  return null;
}
