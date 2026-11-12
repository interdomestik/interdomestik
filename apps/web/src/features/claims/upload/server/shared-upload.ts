import { validateEvidenceFile } from '../evidence-file-policy';
import { refuseUnapprovedUpload } from './refuse-unapproved-upload';
import { validateEvidenceContent } from './validate-evidence-content';
import { validateStoredObject } from './stored-object-validation';
export { validateStoredObject } from './stored-object-validation';
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
      deterministicE2E?: true;
      intentToken: string;
    }
  | { success: false; error: string; status: 400 | 413 | 500 };

export type ClaimUploadConfirmationInput = {
  claimId: string;
  fileId: string;
  originalName?: string;
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

export function revalidatePathForAllLocales(path: string): void {
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

  if (!expectedUploadPath({ bucket, claimId, fileId, storagePath, tenantId })) {
    return {
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    };
  }

  const validation = validateEvidenceFile(storagePath, fileSize, mimeType);
  if (!validation.success) return { success: false, error: validation.error, status: 409 };
  const namedFormat = validateEvidenceFile(
    confirmation.originalName ?? storagePath,
    fileSize,
    mimeType
  );
  if (
    !namedFormat.success ||
    namedFormat.format.mimeType !== mimeType ||
    validation.format.mimeType !== mimeType ||
    (storageContentType ?? mimeType) !== mimeType
  ) {
    return { success: false, error: 'evidence_unsupported', status: 409 };
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

  const stored = await validateStoredObject({
    bucket,
    fileSize,
    logPrefix,
    mimeType,
    storagePath,
    tenantId,
  });
  if (!stored.success) return stored;
  return validateEvidenceContent({ bucket, storagePath, tenantId, format: validation.format });
}

export async function createSignedUploadUrl(params: {
  actorId: string;
  bucket: string;
  claimId: string;
  fileName: string;
  fileSize: number;
  informationRequestId?: string;
  logPrefix: string;
  mimeType: string;
  storageContentType?: string;
  tenantId: string;
}): Promise<SharedGenerateUploadUrlResult> {
  const {
    actorId,
    bucket,
    claimId,
    fileName,
    fileSize,
    informationRequestId,
    logPrefix,
    mimeType,
    storageContentType,
    tenantId,
  } = params;

  const refusal = refuseUnapprovedUpload({ fileName, fileSize, mimeType, storageContentType });
  if (refusal) return refusal;

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
          deterministicE2E:
            (data as { deterministicE2E?: true }).deterministicE2E === true ? true : undefined,
          intentToken: createClaimUploadIntentToken({
            actorId,
            bucket,
            claimId,
            fileId,
            fileSize,
            informationRequestId,
            mimeType,
            storageContentType,
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

      return { success: false, error: 'evidence_upload_failed', status: 500 };
    }

    return {
      success: false,
      error: 'evidence_upload_failed',
      status: 500,
    };
  } catch (error) {
    console.error(`${logPrefix} generate upload URL error`, redactSignedUrlErrorDetails(error));
    return { success: false, error: 'evidence_upload_failed', status: 500 };
  }
}
