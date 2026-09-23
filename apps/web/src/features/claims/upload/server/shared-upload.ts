import { LOCALES } from '@/i18n/locales';
import { redactSignedUrlErrorDetails } from '@/lib/storage/signed-url-exposure';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

import { assertEvidenceStoragePath, buildEvidenceStoragePath } from './storage-path';
import {
  createClaimUploadIntentToken,
  expectedUploadPath,
  verifyClaimUploadIntentToken,
  type ConfirmedUploadValidationResult,
} from './claim-upload-intent';
export {
  createClaimUploadIntentToken,
  expectedUploadPath,
  type ConfirmedUploadValidationResult,
} from './claim-upload-intent';
export {
  InformationRequestUploadConflictError,
  persistClaimDocumentAndQueueWorkflows,
  type UploadCategory,
} from './claim-document-persistence';

const SIGNED_UPLOAD_MAX_ATTEMPTS = 3;
const SIGNED_UPLOAD_RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 250;
const CLAIM_UPLOAD_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const TRANSIENT_UPLOAD_ERROR_PATTERNS = [
  /fetch failed/i,
  /network/i,
  /timed?\s*out/i,
  /econnreset/i,
  /ehostunreach/i,
  /enotfound/i,
  /socket hang up/i,
  /temporar/i,
  /service unavailable/i,
  /too many requests/i,
];

export type SharedGenerateUploadUrlResult =
  | {
      success: true;
      url: string;
      path: string;
      id: string;
      token: string;
      bucket: string;
      intentToken: string;
    }
  | { success: false; error: string; status: 400 | 413 | 500 };

export type ClaimUploadConfirmationInput = {
  claimId: string;
  fileId: string;
  fileSize: number;
  informationRequestId?: string;
  mimeType: string;
  storageContentType?: string;
  storagePath: string;
  uploadIntentToken: string;
};

function shouldRetrySignedUpload(message: string): boolean {
  return TRANSIENT_UPLOAD_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

async function waitForSignedUploadRetry(attempt: number): Promise<void> {
  if (SIGNED_UPLOAD_RETRY_DELAY_MS <= 0) return;
  const delay = SIGNED_UPLOAD_RETRY_DELAY_MS * attempt;
  await new Promise(resolve => setTimeout(resolve, delay));
}

export function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export function sanitizeClaimUploadExtension(fileName: string): string {
  const ext =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replaceAll(/[^a-z0-9]/g, '') || 'bin';
  return ext.slice(0, 16) || 'bin';
}

function numberFromMetadata(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringFromMetadata(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function getObjectMetadataValue(metadata: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (metadata[key] !== undefined) return metadata[key];
  }

  return undefined;
}

export async function validateStoredObject(params: {
  bucket: string;
  fileSize: number;
  logPrefix: string;
  mimeType: string;
  storagePath: string;
  tenantId: string;
}): Promise<ConfirmedUploadValidationResult> {
  const { bucket, fileSize, logPrefix, mimeType, storagePath, tenantId } = params;
  const lastSlashIndex = storagePath.lastIndexOf('/');
  const fileName = storagePath.slice(lastSlashIndex + 1);

  const { listTenantObjectsForSingleFile } = await import('@/lib/storage/service-role');
  const { data, error } = await listTenantObjectsForSingleFile({
    bucket,
    context: 'claim upload verification',
    family: 'claims',
    path: storagePath,
    tenantId,
  });

  if (error) {
    console.error(`${logPrefix} storage object verification failed`, {
      bucket,
      storagePath,
      detail: error.message,
    });
    return { success: false, error: 'Failed to verify uploaded file', status: 500 };
  }

  const storedObject = data?.find(object => object.name === fileName);
  if (!storedObject) {
    return {
      success: false,
      error: 'Uploaded file was not found. Please retry upload.',
      status: 409,
    };
  }

  const metadata = (storedObject.metadata ?? {}) as Record<string, unknown>;
  const storedSize = numberFromMetadata(
    getObjectMetadataValue(metadata, ['size', 'contentLength', 'content_length'])
  );
  const storedMimeType = stringFromMetadata(
    getObjectMetadataValue(metadata, ['mimetype', 'mimeType', 'contentType', 'content_type'])
  );

  if (storedSize !== fileSize || storedMimeType !== mimeType) {
    return {
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    };
  }

  return { success: true };
}

export async function validateConfirmedClaimUpload(params: {
  actorId: string;
  bucket: string;
  confirmation: ClaimUploadConfirmationInput;
  logPrefix: string;
  tenantId: string;
}): Promise<ConfirmedUploadValidationResult> {
  const { actorId, bucket, confirmation, logPrefix, tenantId } = params;
  const {
    claimId,
    fileId,
    fileSize,
    informationRequestId,
    mimeType,
    storageContentType,
    storagePath,
    uploadIntentToken,
  } = confirmation;

  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > CLAIM_UPLOAD_MAX_FILE_SIZE_BYTES ||
    !expectedUploadPath({ bucket, claimId, fileId, storagePath, tenantId })
  ) {
    return {
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    };
  }

  const intentResult = verifyClaimUploadIntentToken({
    actorId,
    bucket,
    claimId,
    fileId,
    fileSize,
    informationRequestId,
    intentToken: uploadIntentToken,
    mimeType,
    storageContentType,
    storagePath,
    tenantId,
  });

  if (!intentResult.success) {
    return intentResult;
  }

  return validateStoredObject({
    bucket,
    fileSize,
    logPrefix,
    mimeType: storageContentType ?? mimeType,
    storagePath,
    tenantId,
  });
}

export async function createSignedUploadUrl(params: {
  actorId: string;
  bucket: string;
  claimId: string;
  fileName: string;
  fileSize: number;
  logPrefix: string;
  mimeType: string;
  tenantId: string;
}): Promise<SharedGenerateUploadUrlResult> {
  const { actorId, bucket, claimId, fileName, fileSize, logPrefix, mimeType, tenantId } = params;

  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    return { success: false, error: 'Invalid file size', status: 400 };
  }

  if (fileSize > CLAIM_UPLOAD_MAX_FILE_SIZE_BYTES) {
    return { success: false, error: 'File too large (max 50MB)', status: 413 };
  }

  const fileId = randomUUID();
  let path: string;

  try {
    path = buildEvidenceStoragePath({
      bucket,
      claimId,
      fileId,
      fileName,
      shape: 'assigned',
      tenantId,
    });
    assertEvidenceStoragePath({
      bucket,
      claimId,
      fileId,
      shape: 'assigned',
      storagePath: path,
      tenantId,
    });
  } catch {
    return { success: false, error: 'Invalid file name', status: 400 };
  }

  try {
    const { createTenantSignedUploadUrl } = await import('@/lib/storage/service-role');
    for (let attempt = 1; attempt <= SIGNED_UPLOAD_MAX_ATTEMPTS; attempt += 1) {
      const { data, error } = await createTenantSignedUploadUrl({
        bucket,
        context: 'claim evidence signed upload',
        family: 'claims',
        path,
        tenantId,
        upsert: true,
      });

      if (!error && data?.signedUrl && data?.token) {
        return {
          success: true,
          url: data.signedUrl,
          path,
          id: fileId,
          token: data.token,
          bucket,
          intentToken: createClaimUploadIntentToken({
            actorId,
            bucket,
            claimId,
            fileId,
            fileSize,
            mimeType,
            storagePath: path,
            tenantId,
          }),
        };
      }

      const details = redactSignedUrlErrorDetails(error ?? 'Unknown storage error');
      const detail = details.message;
      const retryable = shouldRetrySignedUpload(detail);
      const hasAttemptsLeft = attempt < SIGNED_UPLOAD_MAX_ATTEMPTS;

      console.error(`${logPrefix} signed URL error`, {
        bucket,
        path,
        detail,
        attempt,
        maxAttempts: SIGNED_UPLOAD_MAX_ATTEMPTS,
        retryable,
        error: details,
      });

      if (retryable && hasAttemptsLeft) {
        await waitForSignedUploadRetry(attempt);
        continue;
      }

      return { success: false, error: `Failed to generate upload URL: ${detail}`, status: 500 };
    }

    return {
      success: false,
      error: 'Failed to generate upload URL: Unknown storage error',
      status: 500,
    };
  } catch (error) {
    console.error(`${logPrefix} generate upload URL error`, redactSignedUrlErrorDetails(error));
    return { success: false, error: 'Unexpected error', status: 500 };
  }
}
